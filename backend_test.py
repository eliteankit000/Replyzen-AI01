#!/usr/bin/env python3
"""
Backend API Testing for Replyzen AI
Tests all critical backend endpoints as specified in the test request.
"""

import asyncio
import aiohttp
import json
import hmac
import hashlib
import uuid
from datetime import datetime, timezone
import os
from pathlib import Path

# Load environment to get backend URL
backend_dir = Path(__file__).parent / "backend"
if (backend_dir / ".env").exists():
    with open(backend_dir / ".env") as f:
        for line in f:
            if line.strip() and not line.startswith("#"):
                key, value = line.strip().split("=", 1)
                os.environ[key] = value.strip('"')

# Get backend URL from frontend/.env
frontend_env = Path(__file__).parent / "frontend" / ".env"
BACKEND_URL = "http://localhost:8001"  # Default fallback
if frontend_env.exists():
    with open(frontend_env) as f:
        for line in f:
            if line.strip() and line.startswith("REACT_APP_BACKEND_URL"):
                BACKEND_URL = line.split("=", 1)[1].strip()
                break

print(f"🔗 Backend URL: {BACKEND_URL}")

class ReplyzenAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.auth_token = None
        self.session = None
        self.test_results = []
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
            
    def log_result(self, test_name, success, details="", response_data=None):
        """Log test result with details."""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   📝 {details}")
        if response_data and not success:
            print(f"   📄 Response: {response_data}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
        
    async def make_request(self, method, endpoint, **kwargs):
        """Make HTTP request with proper headers."""
        url = f"{self.base_url}{endpoint}"
        headers = kwargs.pop("headers", {})
        
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
            
        try:
            async with self.session.request(method, url, headers=headers, **kwargs) as resp:
                try:
                    data = await resp.json()
                except:
                    data = await resp.text()
                return resp.status, data
        except Exception as e:
            return 0, str(e)
            
    async def test_health_check(self):
        """Test GET /api/health"""
        status, data = await self.make_request("GET", "/api/health")
        
        success = (
            status == 200 and 
            isinstance(data, dict) and 
            data.get("status") == "ok" and
            "replyzen" in data.get("service", "").lower()
        )
        
        details = f"Status: {status}"
        if success:
            details += f", Service: {data.get('service')}, Version: {data.get('version')}"
        
        self.log_result("Health Check", success, details, data if not success else None)
        return success
        
    async def test_config_status(self):
        """Test GET /api/config-status"""
        status, data = await self.make_request("GET", "/api/config-status")
        
        success = status == 200 and isinstance(data, dict)
        all_100_percent = True
        group_details = []
        
        if success:
            for group, info in data.items():
                percentage = info.get("percentage", 0)
                group_details.append(f"{group}: {percentage}%")
                if percentage < 100:
                    all_100_percent = False
        
        details = f"Status: {status}"
        if success:
            details += f", Groups: {', '.join(group_details)}"
            if not all_100_percent:
                details += " (Some groups not 100%)"
        
        self.log_result("Config Status", success, details, data if not success else None)
        return success and all_100_percent
        
    async def test_location_detection(self):
        """Test GET /api/billing/detect-location"""
        status, data = await self.make_request("GET", "/api/billing/detect-location")
        
        success = (
            status == 200 and 
            isinstance(data, dict) and
            "country" in data and
            "currency" in data and
            "payment_provider" in data and
            data.get("currency") in ["USD", "INR"] and
            data.get("payment_provider") in ["razorpay", "paddle"]
        )
        
        details = f"Status: {status}"
        if success:
            details += f", Country: {data.get('country')}, Currency: {data.get('currency')}, Provider: {data.get('payment_provider')}"
        
        self.log_result("Location Detection", success, details, data if not success else None)
        return success
        
    async def test_plans_usd(self):
        """Test GET /api/billing/plans?currency=USD"""
        status, data = await self.make_request("GET", "/api/billing/plans?currency=USD")
        
        success = status == 200 and isinstance(data, list) and len(data) >= 3
        pro_plan = None
        business_plan = None
        
        if success:
            for plan in data:
                if plan.get("id") == "pro":
                    pro_plan = plan
                elif plan.get("id") == "business":
                    business_plan = plan
                    
            success = (
                pro_plan and business_plan and
                pro_plan.get("price_monthly") == 19 and
                pro_plan.get("price_yearly") == 190 and
                business_plan.get("price_monthly") == 49 and
                business_plan.get("price_yearly") == 490 and
                pro_plan.get("currency") == "USD" and
                pro_plan.get("currency_symbol") == "$"
            )
        
        details = f"Status: {status}"
        if success and pro_plan and business_plan:
            details += f", Pro: ${pro_plan.get('price_monthly')}/${pro_plan.get('price_yearly')}, Business: ${business_plan.get('price_monthly')}/${business_plan.get('price_yearly')}"
        
        self.log_result("Plans with USD", success, details, data if not success else None)
        return success
        
    async def test_plans_inr(self):
        """Test GET /api/billing/plans?currency=INR"""
        status, data = await self.make_request("GET", "/api/billing/plans?currency=INR")
        
        success = status == 200 and isinstance(data, list) and len(data) >= 3
        pro_plan = None
        business_plan = None
        
        if success:
            for plan in data:
                if plan.get("id") == "pro":
                    pro_plan = plan
                elif plan.get("id") == "business":
                    business_plan = plan
                    
            success = (
                pro_plan and business_plan and
                pro_plan.get("price_monthly") == 1599 and
                pro_plan.get("price_yearly") == 15990 and
                business_plan.get("price_monthly") == 3999 and
                business_plan.get("price_yearly") == 39990 and
                pro_plan.get("currency") == "INR" and
                pro_plan.get("currency_symbol") == "₹"
            )
        
        details = f"Status: {status}"
        if success and pro_plan and business_plan:
            details += f", Pro: ₹{pro_plan.get('price_monthly')}/₹{pro_plan.get('price_yearly')}, Business: ₹{business_plan.get('price_monthly')}/₹{business_plan.get('price_yearly')}"
        
        self.log_result("Plans with INR", success, details, data if not success else None)
        return success
        
    async def test_plans_default(self):
        """Test GET /api/billing/plans (default currency)"""
        status, data = await self.make_request("GET", "/api/billing/plans")
        
        success = status == 200 and isinstance(data, list) and len(data) >= 3
        pro_plan = None
        
        if success:
            for plan in data:
                if plan.get("id") == "pro":
                    pro_plan = plan
                    break
                    
            success = (
                pro_plan and
                pro_plan.get("currency") == "USD" and
                pro_plan.get("price_monthly") == 19
            )
        
        details = f"Status: {status}"
        if success and pro_plan:
            details += f", Default currency: {pro_plan.get('currency')}, Pro: ${pro_plan.get('price_monthly')}"
        
        self.log_result("Plans Default (USD)", success, details, data if not success else None)
        return success
        
    async def test_auth_register(self):
        """Test POST /api/auth/register"""
        # Generate unique email for test
        test_email = f"test{uuid.uuid4().hex[:8]}@replyzentest.com"
        
        payload = {
            "email": test_email,
            "password": "test123456",
            "full_name": "Test User Replyzen"
        }
        
        status, data = await self.make_request("POST", "/api/auth/register", json=payload)
        
        success = (
            status == 200 and
            isinstance(data, dict) and
            "token" in data and
            "user" in data and
            data["user"]["email"] == test_email and
            data["user"]["plan"] == "free"
        )
        
        if success:
            self.auth_token = data["token"]
            
        details = f"Status: {status}"
        if success:
            details += f", User ID: {data['user']['id']}, Plan: {data['user']['plan']}"
        
        self.log_result("Auth Register", success, details, data if not success else None)
        return success
        
    async def test_auth_login(self):
        """Test POST /api/auth/login"""
        # Use the same email from registration
        if not self.auth_token:
            self.log_result("Auth Login", False, "No auth token from registration", None)
            return False
            
        # Test with invalid credentials first
        payload = {
            "email": "nonexistent@test.com",
            "password": "wrongpassword"
        }
        
        status, data = await self.make_request("POST", "/api/auth/login", json=payload)
        
        # Should fail with 401
        login_security_works = status == 401
        
        details = f"Status: {status}, Login security: {'✓' if login_security_works else '✗'}"
        self.log_result("Auth Login Security", login_security_works, details, None)
        
        return login_security_works
        
    async def test_plan_limits(self):
        """Test GET /api/billing/plan-limits (requires auth)"""
        if not self.auth_token:
            self.log_result("Plan Limits", False, "No auth token available", None)
            return False
            
        status, data = await self.make_request("GET", "/api/billing/plan-limits")
        
        success = (
            status == 200 and
            isinstance(data, dict) and
            "plan" in data and
            "followups_per_month" in data and
            "max_email_accounts" in data and
            data.get("plan") == "free"
        )
        
        details = f"Status: {status}"
        if success:
            details += f", Plan: {data.get('plan')}, Followups: {data.get('followups_per_month')}, Accounts: {data.get('max_email_accounts')}"
        
        self.log_result("Plan Limits", success, details, data if not success else None)
        return success
        
    async def test_checkout_razorpay(self):
        """Test POST /api/billing/checkout (Razorpay)"""
        if not self.auth_token:
            self.log_result("Checkout Razorpay", False, "No auth token available", None)
            return False
            
        payload = {
            "plan_id": "pro",
            "billing_cycle": "monthly",
            "provider": "razorpay"
        }
        
        status, data = await self.make_request("POST", "/api/billing/checkout", json=payload)
        
        success = (
            status == 200 and
            isinstance(data, dict) and
            data.get("provider") == "razorpay" and
            "subscription_id" in data and
            "key_id" in data
        )
        
        details = f"Status: {status}"
        if success:
            details += f", Provider: {data.get('provider')}, Has subscription_id: {'✓' if data.get('subscription_id') else '✗'}"
        
        self.log_result("Checkout Razorpay", success, details, data if not success else None)
        return success
        
    async def test_checkout_paddle(self):
        """Test POST /api/billing/checkout (Paddle)"""
        if not self.auth_token:
            self.log_result("Checkout Paddle", False, "No auth token available", None)
            return False
            
        payload = {
            "plan_id": "pro",
            "billing_cycle": "monthly",
            "provider": "paddle"
        }
        
        status, data = await self.make_request("POST", "/api/billing/checkout", json=payload)
        
        success = (
            status == 200 and
            isinstance(data, dict) and
            data.get("provider") == "paddle" and
            "price_id" in data and
            "vendor_id" in data
        )
        
        details = f"Status: {status}"
        if success:
            details += f", Provider: {data.get('provider')}, Has price_id: {'✓' if data.get('price_id') else '✗'}"
        
        self.log_result("Checkout Paddle", success, details, data if not success else None)
        return success
        
    async def test_razorpay_webhook(self):
        """Test POST /api/billing/webhook/razorpay"""
        # Sample Razorpay webhook payload
        payload = {
            "event": "subscription.activated",
            "payload": {
                "subscription": {
                    "entity": {
                        "id": f"sub_test_{uuid.uuid4().hex[:8]}",
                        "notes": {
                            "user_id": "test-user-123",
                            "plan": "pro"
                        }
                    }
                }
            }
        }
        
        # Create signature if webhook secret is available
        webhook_secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
        headers = {}
        
        if webhook_secret:
            body = json.dumps(payload).encode()
            signature = hmac.new(
                webhook_secret.encode(), 
                body, 
                hashlib.sha256
            ).hexdigest()
            headers["X-Razorpay-Signature"] = signature
        
        status, data = await self.make_request(
            "POST", 
            "/api/billing/webhook/razorpay", 
            json=payload,
            headers=headers
        )
        
        success = status == 200 and isinstance(data, dict) and data.get("status") == "ok"
        
        details = f"Status: {status}, Has webhook secret: {'✓' if webhook_secret else '✗'}"
        
        self.log_result("Razorpay Webhook", success, details, data if not success else None)
        return success
        
    async def test_paddle_webhook(self):
        """Test POST /api/billing/webhook/paddle"""
        # Sample Paddle webhook payload
        payload = {
            "event_type": "subscription.activated",
            "data": {
                "id": f"sub_paddle_{uuid.uuid4().hex[:8]}",
                "custom_data": {
                    "user_id": "test-user-456",
                    "plan": "business"
                }
            }
        }
        
        # Create signature if webhook secret is available
        webhook_secret = os.environ.get("PADDLE_WEBHOOK_SECRET", "")
        headers = {}
        
        if webhook_secret:
            body = json.dumps(payload)
            ts = str(int(datetime.now(timezone.utc).timestamp()))
            signed_payload = f"{ts}:{body}"
            signature = hmac.new(
                webhook_secret.encode(),
                signed_payload.encode(),
                hashlib.sha256
            ).hexdigest()
            headers["Paddle-Signature"] = f"ts={ts};h1={signature}"
        
        status, data = await self.make_request(
            "POST", 
            "/api/billing/webhook/paddle", 
            json=payload,
            headers=headers
        )
        
        success = status == 200 and isinstance(data, dict) and data.get("status") == "ok"
        
        details = f"Status: {status}, Has webhook secret: {'✓' if webhook_secret else '✗'}"
        
        self.log_result("Paddle Webhook", success, details, data if not success else None)
        return success
        
    async def test_gmail_auth_url(self):
        """Test GET /api/emails/gmail/auth-url (requires auth)"""
        if not self.auth_token:
            self.log_result("Gmail Auth URL", False, "No auth token available", None)
            return False
            
        status, data = await self.make_request("GET", "/api/emails/gmail/auth-url")
        
        success = (
            status == 200 and
            isinstance(data, dict) and
            "auth_url" in data and
            "accounts.google.com" in data.get("auth_url", "")
        )
        
        details = f"Status: {status}"
        if success:
            details += f", Has OAuth URL: ✓"
        
        self.log_result("Gmail Auth URL", success, details, data if not success else None)
        return success
        
    async def run_all_tests(self):
        """Run all backend API tests."""
        print("🚀 Starting Replyzen AI Backend API Tests\n")
        
        tests = [
            ("Health Check", self.test_health_check),
            ("Config Status", self.test_config_status),
            ("Location Detection", self.test_location_detection),
            ("Plans USD", self.test_plans_usd),
            ("Plans INR", self.test_plans_inr),
            ("Plans Default", self.test_plans_default),
            ("Auth Register", self.test_auth_register),
            ("Auth Login", self.test_auth_login),
            ("Plan Limits", self.test_plan_limits),
            ("Checkout Razorpay", self.test_checkout_razorpay),
            ("Checkout Paddle", self.test_checkout_paddle),
            ("Razorpay Webhook", self.test_razorpay_webhook),
            ("Paddle Webhook", self.test_paddle_webhook),
            ("Gmail Auth URL", self.test_gmail_auth_url),
        ]
        
        for test_name, test_func in tests:
            try:
                await test_func()
            except Exception as e:
                self.log_result(test_name, False, f"Exception: {str(e)}", None)
            print()  # Add spacing between tests
            
        # Summary
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print("=" * 60)
        print(f"📊 TEST SUMMARY: {passed}/{total} tests passed")
        print("=" * 60)
        
        # Show failed tests
        failed_tests = [r for r in self.test_results if not r["success"]]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for result in failed_tests:
                print(f"   • {result['test']}: {result['details']}")
                if result.get('response'):
                    print(f"     Response: {result['response']}")
        else:
            print("\n🎉 All tests passed!")
            
        return passed, total, failed_tests

async def main():
    """Main test runner."""
    async with ReplyzenAPITester() as tester:
        passed, total, failed = await tester.run_all_tests()
        
        if failed:
            exit(1)  # Exit with error code if tests failed
        else:
            exit(0)  # Success

if __name__ == "__main__":
    asyncio.run(main())