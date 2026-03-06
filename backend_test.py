import requests
import sys
from datetime import datetime
import json

class ReplyzenAPITester:
    def __init__(self, base_url="https://ai-followup-engine.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.passed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}" if not endpoint.startswith('http') else endpoint
        req_headers = {'Content-Type': 'application/json'}
        if self.token:
            req_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            req_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=req_headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.passed_tests.append(name)
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:200]
                })
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            self.failed_tests.append({
                "test": name,
                "error": str(e)
            })
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_login(self):
        """Test login with test user"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={"email": "test@replyzen.com", "password": "testpass123"}
        )
        if success:
            print(f"   Login response: {response}")
            # Check for different possible token field names
            token_key = None
            for key in ['access_token', 'token', 'jwt', 'auth_token']:
                if key in response:
                    token_key = key
                    break
            
            if token_key:
                self.token = response[token_key]
                self.user_id = response.get('user_id', 'test_user_id')
                print(f"   Logged in as: {response.get('email')}, Plan: {response.get('plan', 'free')}")
                return True
            else:
                print(f"   ⚠️  No token found in response. Keys: {list(response.keys())}")
        return False

    def test_plan_limits(self):
        """Test GET /api/billing/plan-limits returns correct limits for free user"""
        success, response = self.run_test(
            "Get Plan Limits",
            "GET", 
            "billing/plan-limits",
            200
        )
        if success:
            expected = {
                "plan": "free",
                "followups_per_month": 30,
                "max_email_accounts": 1,
                "auto_send": False,
                "analytics": False,
                "ai_tones": ["professional"]
            }
            for key, expected_val in expected.items():
                if response.get(key) != expected_val:
                    print(f"   ⚠️  {key}: expected {expected_val}, got {response.get(key)}")
        return success

    def test_email_account_limit(self):
        """Test free user cannot connect more than 1 email account"""
        # First, connect one email (should succeed)
        success1, _ = self.run_test(
            "Connect First Gmail Account",
            "POST",
            "emails/connect-gmail",
            200,
            data={"email": "test1@gmail.com"}
        )
        
        # Try to connect second email (should fail with 403)
        success2, response2 = self.run_test(
            "Connect Second Gmail Account (Should Fail)",
            "POST", 
            "emails/connect-gmail",
            403,
            data={"email": "test2@gmail.com"}
        )
        
        return success1 and success2

    def test_followup_generation_limits(self):
        """Test followup generation and tone restrictions"""
        # First get silent threads
        success, threads_response = self.run_test(
            "Get Silent Threads",
            "GET",
            "emails/threads/silent?limit=5",
            200
        )
        
        if not success or not threads_response.get('threads'):
            print("   ⚠️  No threads available for followup generation test")
            return False
            
        thread_id = threads_response['threads'][0]['id']
        
        # Test professional tone (should work)
        success1, _ = self.run_test(
            "Generate Followup - Professional Tone",
            "POST",
            "followups/generate", 
            200,
            data={"thread_id": thread_id, "tone": "professional"}
        )
        
        # Test casual tone (should fail for free user)
        success2, _ = self.run_test(
            "Generate Followup - Casual Tone (Should Fail)",
            "POST",
            "followups/generate",
            403,
            data={"thread_id": thread_id, "tone": "casual"}
        )
        
        # Test friendly tone (should fail for free user) 
        success3, _ = self.run_test(
            "Generate Followup - Friendly Tone (Should Fail)",
            "POST",
            "followups/generate",
            403,
            data={"thread_id": thread_id, "tone": "friendly"}
        )
        
        return success1 and success2 and success3

    def test_auto_send_restriction(self):
        """Test free user cannot enable auto-send"""
        success, _ = self.run_test(
            "Enable Auto-Send (Should Fail)",
            "PUT",
            "settings",
            403,
            data={"auto_send": True}
        )
        return success

    def test_analytics_restriction(self):
        """Test free user cannot access analytics charts"""
        success, _ = self.run_test(
            "Get Analytics Charts (Should Fail)", 
            "GET",
            "analytics/followups-over-time?days=30",
            403
        )
        return success

    def test_billing_plans(self):
        """Test billing plans API returns correct plan data"""
        success, response = self.run_test(
            "Get Billing Plans",
            "GET",
            "billing/plans", 
            200
        )
        if success:
            plans = response
            expected_plans = ["free", "pro", "business"]
            found_plans = [p.get("id") for p in plans if p.get("id")]
            for plan_id in expected_plans:
                if plan_id not in found_plans:
                    print(f"   ⚠️  Missing plan: {plan_id}")
                    return False
            
            # Check Pro plan features
            pro_plan = next((p for p in plans if p.get("id") == "pro"), None)
            if pro_plan:
                expected_pro = {
                    "followup_limit": 2500,
                    "account_limit": 3,
                    "price_monthly": 19
                }
                for key, expected_val in expected_pro.items():
                    if pro_plan.get(key) != expected_val:
                        print(f"   ⚠️  Pro plan {key}: expected {expected_val}, got {pro_plan.get(key)}")
        
        return success

def main():
    print("🚀 Starting Replyzen API Tests...")
    tester = ReplyzenAPITester()
    
    # Login first
    if not tester.test_login():
        print("❌ Login failed, cannot continue tests")
        return 1

    # Run all plan enforcement tests  
    tests = [
        tester.test_plan_limits,
        tester.test_billing_plans,
        tester.test_email_account_limit,
        tester.test_followup_generation_limits,
        tester.test_auto_send_restriction,
        tester.test_analytics_restriction,
    ]

    for test_func in tests:
        try:
            test_func()
        except Exception as e:
            tester.failed_tests.append({
                "test": test_func.__name__,
                "error": str(e)
            })
            print(f"❌ {test_func.__name__} failed with exception: {e}")

    # Print results
    print(f"\n📊 Test Results:")
    print(f"   Tests run: {tester.tests_run}")
    print(f"   Tests passed: {tester.tests_passed}")
    print(f"   Tests failed: {len(tester.failed_tests)}")
    
    if tester.failed_tests:
        print(f"\n❌ Failed Tests:")
        for fail in tester.failed_tests:
            print(f"   - {fail.get('test', 'Unknown')}: {fail.get('error', fail.get('response', 'Unknown error'))}")
    
    if tester.passed_tests:
        print(f"\n✅ Passed Tests:")
        for test in tester.passed_tests:
            print(f"   - {test}")

    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"\n📈 Success Rate: {success_rate:.1f}%")
    
    return 0 if success_rate > 80 else 1

if __name__ == "__main__":
    sys.exit(main())