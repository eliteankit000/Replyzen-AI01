#!/usr/bin/env python3
"""
AI Inbox Operating System Backend Testing
==========================================
Comprehensive testing for the new AI Inbox Operating System backend implementation.

Test Coverage:
1. Health Check: GET /api/health
2. Composer Routes (all require auth):
   - POST /api/composer/generate (email from topic)
   - POST /api/composer/subjects (subject suggestions)
   - POST /api/composer/quality (email quality check)
   - POST /api/composer/from-file (file-based generation)
   - GET /api/composer/processors (check available processors)
   - GET /api/composer/templates (list templates)
   - POST /api/composer/templates (save template)
3. Updated Inbox Routes:
   - GET /api/inbox/messages (with new filters: category, priority)
   - GET /api/inbox/daily-summary (top 5 priority emails)
   - POST /api/inbox/generate-reply (single reply)
   - POST /api/inbox/generate-replies (3 tone options)
   - POST /api/inbox/gmail-compose-url (Gmail compose link)
   - GET /api/inbox/stats (enhanced stats)
4. Google OAuth Compliance:
   - Verify that auth_routes.py uses ONLY gmail.readonly scope
"""

import requests
import json
import sys
import os
from datetime import datetime
import tempfile
import io
import urllib3

# Disable SSL warnings for testing
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configuration
BACKEND_URL = "https://email-insight-hub.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

# Test data
TEST_USER_EMAIL = "testuser@replyzen.ai"
TEST_USER_PASSWORD = "TestPassword123!"
TEST_USER_NAME = "Test User"

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        
    def log_test(self, test_name, success, details="", error=""):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "error": error,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"    Details: {details}")
        if error:
            print(f"    Error: {error}")
        print()
    
    def make_request(self, method, endpoint, **kwargs):
        """Make HTTP request with proper headers"""
        url = f"{API_BASE}{endpoint}"
        headers = kwargs.get('headers', {})
        
        if self.auth_token:
            headers['Authorization'] = f'Bearer {self.auth_token}'
        
        kwargs['headers'] = headers
        
        # Add SSL verification and timeout settings
        kwargs.setdefault('verify', False)  # Disable SSL verification for testing
        kwargs.setdefault('timeout', 30)
        
        try:
            response = self.session.request(method, url, **kwargs)
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return None
    
    def test_health_check(self):
        """Test GET /api/health"""
        print("🔍 Testing Health Check...")
        
        response = self.make_request('GET', '/health')
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('status') == 'ok' and data.get('service') == 'replyzen-ai':
                self.log_test("Health Check", True, f"Service: {data.get('service')}, Version: {data.get('version')}")
            else:
                self.log_test("Health Check", False, error="Invalid health check response format")
        else:
            status_code = response.status_code if response else "No response"
            self.log_test("Health Check", False, error=f"HTTP {status_code}")
    
    def test_auth_setup(self):
        """Set up authentication for protected endpoints"""
        print("🔍 Setting up Authentication...")
        
        # Try to register a test user
        register_data = {
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "full_name": TEST_USER_NAME
        }
        
        print(f"Attempting registration for: {TEST_USER_EMAIL}")
        response = self.make_request('POST', '/auth/register', json=register_data)
        
        if response is None:
            self.log_test("Authentication Setup", False, error="No response from server")
            return
            
        print(f"Registration response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            self.auth_token = data.get('token')
            self.log_test("User Registration", True, f"User ID: {data.get('user', {}).get('id')}")
        elif response.status_code == 400:
            # User already exists, try login
            login_data = {
                "email": TEST_USER_EMAIL,
                "password": TEST_USER_PASSWORD
            }
            
            print(f"User exists, attempting login for: {TEST_USER_EMAIL}")
            response = self.make_request('POST', '/auth/login', json=login_data)
            
            if response is None:
                self.log_test("Authentication Setup", False, error="No response from login server")
                return
                
            print(f"Login response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get('token')
                self.log_test("User Login", True, f"User ID: {data.get('user', {}).get('id')}")
            else:
                error_text = response.text if response else "No response"
                self.log_test("Authentication Setup", False, error=f"Failed to login existing user: {error_text}")
        else:
            error_text = response.text if response else "No response"
            self.log_test("Authentication Setup", False, error=f"HTTP {response.status_code}: {error_text}")
    
    def test_composer_routes(self):
        """Test all composer routes"""
        print("🔍 Testing Composer Routes...")
        
        if not self.auth_token:
            self.log_test("Composer Routes", False, error="No authentication token available")
            return
        
        # Test POST /api/composer/generate
        generate_data = {
            "recipient": "client@example.com",
            "topic": "Follow up on our meeting about the new project proposal",
            "email_type": "Follow-up",
            "tone": "professional",
            "additional_context": "We discussed budget and timeline"
        }
        
        response = self.make_request('POST', '/composer/generate', json=generate_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data', {}).get('subject') and data.get('data', {}).get('body'):
                self.log_test("Composer Generate Email", True, f"Generated email with subject: {data['data']['subject'][:50]}...")
            else:
                self.log_test("Composer Generate Email", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Composer Generate Email", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test POST /api/composer/subjects
        subjects_data = {
            "topic": "Project proposal follow-up",
            "email_type": "Follow-up",
            "tone": "professional"
        }
        
        response = self.make_request('POST', '/composer/subjects', json=subjects_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data', {}).get('suggestions'):
                suggestions_count = len(data['data']['suggestions'])
                self.log_test("Composer Subject Suggestions", True, f"Generated {suggestions_count} subject suggestions")
            else:
                self.log_test("Composer Subject Suggestions", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Composer Subject Suggestions", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test POST /api/composer/quality
        quality_data = {
            "body": "Hi there, I hope you're doing well. I wanted to follow up on our conversation about the project proposal. Could we schedule a meeting to discuss the next steps? Best regards, Test User"
        }
        
        response = self.make_request('POST', '/composer/quality', json=quality_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data'):
                self.log_test("Composer Quality Check", True, f"Quality analysis completed")
            else:
                self.log_test("Composer Quality Check", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Composer Quality Check", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test GET /api/composer/processors
        response = self.make_request('GET', '/composer/processors')
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data'):
                processors = data['data']
                self.log_test("Composer Processors Check", True, f"Available processors: {list(processors.keys())}")
            else:
                self.log_test("Composer Processors Check", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Composer Processors Check", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test GET /api/composer/templates
        response = self.make_request('GET', '/composer/templates')
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and 'templates' in data.get('data', {}):
                template_count = data['data'].get('count', 0)
                self.log_test("Composer List Templates", True, f"Found {template_count} templates")
            else:
                self.log_test("Composer List Templates", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Composer List Templates", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test POST /api/composer/templates
        template_data = {
            "name": "Test Follow-up Template",
            "subject": "Following up on our conversation",
            "body": "Hi {{name}},\n\nI hope you're doing well. I wanted to follow up on our recent conversation about {{topic}}.\n\nBest regards,\n{{sender_name}}",
            "email_type": "Follow-up",
            "tone": "professional"
        }
        
        response = self.make_request('POST', '/composer/templates', json=template_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data', {}).get('id'):
                template_id = data['data']['id']
                self.log_test("Composer Save Template", True, f"Template saved with ID: {template_id}")
            else:
                self.log_test("Composer Save Template", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Composer Save Template", False, error=f"HTTP {status_code}: {error_msg}")
    
    def test_inbox_routes(self):
        """Test all inbox routes"""
        print("🔍 Testing Inbox Routes...")
        
        if not self.auth_token:
            self.log_test("Inbox Routes", False, error="No authentication token available")
            return
        
        # Test GET /api/inbox/messages
        response = self.make_request('GET', '/inbox/messages?limit=10')
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and 'data' in data:
                message_count = data.get('count', 0)
                self.log_test("Inbox Messages List", True, f"Retrieved {message_count} messages")
            else:
                self.log_test("Inbox Messages List", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Inbox Messages List", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test GET /api/inbox/daily-summary
        response = self.make_request('GET', '/inbox/daily-summary')
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data'):
                summary_data = data['data']
                top_emails_count = len(summary_data.get('top_emails', []))
                self.log_test("Inbox Daily Summary", True, f"Retrieved daily summary with {top_emails_count} top emails")
            else:
                self.log_test("Inbox Daily Summary", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Inbox Daily Summary", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test POST /api/inbox/generate-reply
        reply_data = {
            "message_id": "test_message_123",
            "message": "Hi, I wanted to follow up on our project discussion. When can we schedule the next meeting?",
            "platform": "gmail",
            "tone": "professional"
        }
        
        response = self.make_request('POST', '/inbox/generate-reply', json=reply_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data'):
                self.log_test("Inbox Generate Reply", True, "AI reply generated successfully")
            else:
                self.log_test("Inbox Generate Reply", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Inbox Generate Reply", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test POST /api/inbox/generate-replies
        replies_data = {
            "message_id": "test_message_456",
            "subject": "Project Timeline Discussion",
            "snippet": "I wanted to discuss the project timeline and deliverables for the upcoming quarter.",
            "sender": "client@example.com"
        }
        
        response = self.make_request('POST', '/inbox/generate-replies', json=replies_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data', {}).get('replies'):
                replies_count = len(data['data']['replies'])
                self.log_test("Inbox Generate Replies", True, f"Generated {replies_count} reply options")
            else:
                self.log_test("Inbox Generate Replies", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Inbox Generate Replies", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test POST /api/inbox/gmail-compose-url
        compose_data = {
            "to": "client@example.com",
            "subject": "Re: Project Timeline Discussion",
            "body": "Hi,\n\nThank you for your message. I'd be happy to discuss the project timeline with you.\n\nBest regards,\nTest User"
        }
        
        response = self.make_request('POST', '/inbox/gmail-compose-url', json=compose_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data', {}).get('gmail_url'):
                gmail_url = data['data']['gmail_url']
                self.log_test("Inbox Gmail Compose URL", True, f"Gmail URL generated: {gmail_url[:100]}...")
            else:
                self.log_test("Inbox Gmail Compose URL", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Inbox Gmail Compose URL", False, error=f"HTTP {status_code}: {error_msg}")
        
        # Test GET /api/inbox/stats
        response = self.make_request('GET', '/inbox/stats')
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data'):
                self.log_test("Inbox Stats", True, "Inbox statistics retrieved successfully")
            else:
                self.log_test("Inbox Stats", False, error="Invalid response format")
        else:
            status_code = response.status_code if response else "No response"
            error_msg = response.text if response else "No response"
            self.log_test("Inbox Stats", False, error=f"HTTP {status_code}: {error_msg}")
    
    def test_oauth_compliance(self):
        """Test Google OAuth compliance - verify only gmail.readonly scope is used"""
        print("🔍 Testing Google OAuth Compliance...")
        
        try:
            # Read the auth_routes.py file to check OAuth scopes
            auth_routes_path = "/app/backend/routes/auth_routes.py"
            
            with open(auth_routes_path, 'r') as f:
                content = f.read()
            
            # Check for gmail scopes
            gmail_readonly_found = "gmail.readonly" in content
            gmail_send_found = "gmail.send" in content
            gmail_modify_found = "gmail.modify" in content
            
            if gmail_readonly_found and not gmail_send_found and not gmail_modify_found:
                self.log_test("OAuth Compliance - Gmail Readonly Only", True, "Only gmail.readonly scope found in auth_routes.py")
            elif gmail_readonly_found and (gmail_send_found or gmail_modify_found):
                scopes_found = []
                if gmail_send_found:
                    scopes_found.append("gmail.send")
                if gmail_modify_found:
                    scopes_found.append("gmail.modify")
                self.log_test("OAuth Compliance - Gmail Readonly Only", False, 
                            error=f"Found prohibited scopes: {', '.join(scopes_found)}")
            else:
                self.log_test("OAuth Compliance - Gmail Readonly Only", False, 
                            error="gmail.readonly scope not found in auth_routes.py")
            
            # Check for proper scope separation
            auth_scopes_found = "GOOGLE_AUTH_SCOPES" in content
            gmail_scopes_found = "GOOGLE_GMAIL_SCOPES" in content
            
            if auth_scopes_found and gmail_scopes_found:
                self.log_test("OAuth Scope Separation", True, "Proper separation between auth and Gmail scopes")
            else:
                self.log_test("OAuth Scope Separation", False, 
                            error="Missing proper scope separation in auth_routes.py")
                
        except Exception as e:
            self.log_test("OAuth Compliance Check", False, error=f"Failed to read auth_routes.py: {str(e)}")
    
    def test_unauthenticated_requests(self):
        """Test that protected endpoints return 401 for unauthenticated requests"""
        print("🔍 Testing Unauthenticated Access...")
        
        # Temporarily remove auth token
        original_token = self.auth_token
        self.auth_token = None
        
        protected_endpoints = [
            ('POST', '/composer/generate'),
            ('POST', '/composer/subjects'),
            ('POST', '/composer/quality'),
            ('GET', '/composer/processors'),
            ('GET', '/composer/templates'),
            ('POST', '/composer/templates'),
            ('GET', '/inbox/messages'),
            ('GET', '/inbox/daily-summary'),
            ('POST', '/inbox/generate-reply'),
            ('POST', '/inbox/generate-replies'),
            ('POST', '/inbox/gmail-compose-url'),
            ('GET', '/inbox/stats'),
        ]
        
        auth_failures = []
        auth_successes = []
        
        for method, endpoint in protected_endpoints:
            test_data = {"test": "data"} if method == 'POST' else None
            response = self.make_request(method, endpoint, json=test_data)
            
            if response and response.status_code == 401:
                auth_successes.append(f"{method} {endpoint}")
            else:
                status_code = response.status_code if response else "No response"
                auth_failures.append(f"{method} {endpoint} (HTTP {status_code})")
        
        # Restore auth token
        self.auth_token = original_token
        
        if not auth_failures:
            self.log_test("Protected Endpoints Authentication", True, 
                        f"All {len(auth_successes)} protected endpoints properly return 401")
        else:
            self.log_test("Protected Endpoints Authentication", False, 
                        error=f"Endpoints not properly protected: {', '.join(auth_failures)}")
    
    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting AI Inbox Operating System Backend Tests")
        print("=" * 60)
        
        # Run tests in order
        self.test_health_check()
        self.test_auth_setup()
        self.test_unauthenticated_requests()
        self.test_composer_routes()
        self.test_inbox_routes()
        self.test_oauth_compliance()
        
        # Print summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result['success'])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['error']}")
        
        print("\n" + "=" * 60)
        
        return passed_tests, failed_tests

if __name__ == "__main__":
    tester = BackendTester()
    passed, failed = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if failed == 0 else 1)