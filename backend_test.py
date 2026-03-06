#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class ReplyzenAPITester:
    def __init__(self, base_url="https://followup-engine-3.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    resp_json = response.json()
                    if endpoint == "auth/me" and resp_json.get("id"):
                        self.user_id = resp_json["id"]
                    return True, resp_json
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "health", 200)

    def test_login_existing_user(self):
        """Test login with existing test user"""
        success, response = self.run_test(
            "Login Existing User",
            "POST",
            "auth/login",
            200,
            data={"email": "test@replyzen.com", "password": "testpass123"}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Token acquired: {self.token[:20]}...")
            return True
        return False

    def test_register_new_user(self):
        """Test registration with new user"""
        timestamp = datetime.now().strftime("%H%M%S")
        test_email = f"testuser{timestamp}@example.com"
        success, response = self.run_test(
            "Register New User",
            "POST", 
            "auth/register",
            200,
            data={
                "email": test_email,
                "password": "testpass123",
                "full_name": f"Test User {timestamp}"
            }
        )
        if success and 'token' in response:
            print(f"   New user registered: {test_email}")
            return True
        return False

    def test_get_user_profile(self):
        """Test getting user profile"""
        return self.run_test("Get User Profile", "GET", "auth/me", 200)

    def test_connect_gmail(self):
        """Test connecting Gmail account (MOCKED)"""
        success, response = self.run_test(
            "Connect Gmail",
            "POST",
            "emails/connect-gmail", 
            200,
            data={"email": "test@gmail.com"}
        )
        if success:
            print(f"   Gmail connected with mock data")
        return success

    def test_list_email_accounts(self):
        """Test listing email accounts"""
        return self.run_test("List Email Accounts", "GET", "emails/accounts", 200)

    def test_get_silent_threads(self):
        """Test getting silent email threads"""
        return self.run_test("Get Silent Threads", "GET", "emails/threads/silent", 200)

    def test_sync_emails(self):
        """Test email synchronization"""
        return self.run_test("Sync Emails", "POST", "emails/sync", 200)

    def test_generate_followup(self):
        """Test AI followup generation"""
        # First get silent threads to have a thread_id
        success, threads_response = self.run_test("Get Threads for Followup", "GET", "emails/threads/silent?limit=1", 200)
        
        if success and threads_response.get('threads') and len(threads_response['threads']) > 0:
            thread_id = threads_response['threads'][0]['id']
            print(f"   Using thread_id: {thread_id}")
            
            return self.run_test(
                "Generate AI Followup",
                "POST",
                "followups/generate",
                200,
                data={"thread_id": thread_id, "tone": "professional"}
            )
        else:
            print("   ⚠️  No silent threads available for followup generation")
            return True  # Skip this test

    def test_list_followups(self):
        """Test listing followups"""
        return self.run_test("List Followups", "GET", "followups", 200)

    def test_analytics_overview(self):
        """Test analytics overview"""
        return self.run_test("Analytics Overview", "GET", "analytics/overview", 200)

    def test_followups_over_time(self):
        """Test followups over time analytics"""
        return self.run_test("Followups Over Time", "GET", "analytics/followups-over-time?days=7", 200)

    def test_top_contacts(self):
        """Test top contacts analytics"""
        return self.run_test("Top Contacts", "GET", "analytics/top-contacts", 200)

    def test_billing_plans(self):
        """Test getting billing plans"""
        return self.run_test("Billing Plans", "GET", "billing/plans", 200)

    def test_billing_subscription(self):
        """Test getting subscription status"""
        return self.run_test("Billing Subscription", "GET", "billing/subscription", 200)

    def test_settings_get(self):
        """Test getting user settings"""
        return self.run_test("Get Settings", "GET", "settings", 200)

    def test_settings_update(self):
        """Test updating user settings"""
        return self.run_test(
            "Update Settings",
            "PUT",
            "settings",
            200,
            data={"daily_digest": True, "auto_send": False}
        )

    def test_profile_update(self):
        """Test updating user profile"""
        return self.run_test(
            "Update Profile", 
            "PUT",
            "settings/profile",
            200,
            data={"full_name": "Updated Test User"}
        )

def main():
    print("🚀 Starting Replyzen AI Backend Testing")
    print("=" * 50)
    
    tester = ReplyzenAPITester()
    
    # Core tests - health check
    if not tester.test_health_check()[0]:
        print("❌ Health check failed, stopping tests")
        return 1

    # Authentication tests  
    print(f"\n{'='*50}")
    print("🔐 AUTHENTICATION TESTS")
    print(f"{'='*50}")
    
    if not tester.test_login_existing_user():
        print("❌ Login failed, trying registration...")
        if not tester.test_register_new_user():
            print("❌ Both login and registration failed, stopping tests")
            return 1

    tester.test_get_user_profile()

    # Email & Gmail integration tests
    print(f"\n{'='*50}")
    print("📧 EMAIL & GMAIL TESTS") 
    print(f"{'='*50}")
    
    tester.test_list_email_accounts()
    tester.test_connect_gmail()
    tester.test_sync_emails()
    tester.test_get_silent_threads()

    # Follow-up AI generation tests
    print(f"\n{'='*50}")
    print("🤖 AI FOLLOWUP TESTS")
    print(f"{'='*50}")
    
    tester.test_generate_followup()
    tester.test_list_followups()

    # Analytics tests
    print(f"\n{'='*50}")
    print("📊 ANALYTICS TESTS")
    print(f"{'='*50}")
    
    tester.test_analytics_overview()
    tester.test_followups_over_time()
    tester.test_top_contacts()

    # Billing tests
    print(f"\n{'='*50}")
    print("💳 BILLING TESTS")
    print(f"{'='*50}")
    
    tester.test_billing_plans()
    tester.test_billing_subscription()

    # Settings tests
    print(f"\n{'='*50}")
    print("⚙️  SETTINGS TESTS")
    print(f"{'='*50}")
    
    tester.test_settings_get()
    tester.test_settings_update()
    tester.test_profile_update()

    # Final results
    print(f"\n{'='*50}")
    print("📋 TEST RESULTS")
    print(f"{'='*50}")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All backend tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())