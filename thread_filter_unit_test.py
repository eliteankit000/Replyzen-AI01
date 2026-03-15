#!/usr/bin/env python3
"""
Unit tests for thread filter service functions.
These tests can run without database connection.
"""

import sys
import os
sys.path.append('/app/backend')

from services.thread_filter_service import (
    is_automated_sender,
    is_automated_subject, 
    should_show_reply,
    get_thread_status,
    filter_threads_for_reply
)

def test_automated_sender_detection():
    """Test automated sender pattern detection"""
    print("🔍 Testing Automated Sender Detection...")
    
    # Test automated senders
    automated_senders = [
        "noreply@example.com",
        "no-reply@github.com", 
        "donotreply@service.com",
        "do-not-reply@company.org",
        "notifications@slack.com",
        "notification@app.com",
        "alerts@monitoring.com",
        "alert@system.com",
        "mailer-daemon@example.com",
        "postmaster@domain.com",
        "bounce@service.com",
        "support@service.com",
        "newsletter@company.com",
        "news@updates.com",
        "updates@service.com",
        "update@app.com",
        "promo@deals.com",
        "promotions@store.com",
        "marketing@company.com",
        "info@business.com",
        "hello@startup.com",
        "team@company.com",
        "accounts@service.com",
        "account@platform.com",
        "billing@service.com",
        "orders@shop.com",
        "order@ecommerce.com",
        "receipts@store.com",
        "receipt@service.com",
        "invoices@company.com",
        "invoice@billing.com",
        "shipping@logistics.com",
        "delivery@courier.com",
        "automated@system.com",
        "system@platform.com",
        "admin@service.com"
    ]
    
    # Test non-automated senders
    non_automated = [
        "john.doe@company.com",
        "sarah@example.org",
        "contact@personalbusiness.com",
        "developer@startup.io",
        "ceo@company.com",
        "manager@department.com"
    ]
    
    failed = []
    
    for sender in automated_senders:
        if not is_automated_sender(sender):
            failed.append(f"Failed to detect automated: {sender}")
    
    for sender in non_automated:
        if is_automated_sender(sender):
            failed.append(f"False positive for: {sender}")
    
    if failed:
        print("❌ FAIL: Automated sender detection")
        for error in failed:
            print(f"   - {error}")
        return False
    else:
        print("✅ PASS: All automated sender patterns detected correctly")
        return True

def test_automated_subject_detection():
    """Test automated subject pattern detection"""
    print("\n🔍 Testing Automated Subject Detection...")
    
    # Test automated subjects
    automated_subjects = [
        "Unsubscribe from our newsletter",
        "Newsletter - Weekly Update",
        "Weekly digest - Important updates", 
        "Daily digest for Monday",
        "Monthly update - March 2024",
        "Promotional offer just for you",
        "Special offer - 50% off",
        "Limited time deal",
        "Discount alert - Save now",
        "Sale alert - Spring collection",
        "Order confirmation #12345",
        "Shipping confirmation for order #67890",
        "Delivery notification for package",
        "Receipt for your purchase",
        "Invoice #INV-2024-001",
        "Payment received confirmation",
        "Password reset request",
        "Verify your email address",
        "Confirm your account",
        "Account activation required",
        "Security alert for your account",
        "Login notification from new device",
        "Two-factor authentication code",
        "2FA verification code",
        "Your OTP is 123456",
        "Verification code: 789012"
    ]
    
    # Test normal subjects
    normal_subjects = [
        "Meeting tomorrow at 3pm",
        "Project update needed",
        "Quick question about the proposal",
        "Re: Contract review",
        "Follow-up on our discussion",
        "Budget approval request",
        "Team lunch next Friday",
        "Can we reschedule?",
        "Thanks for the meeting",
        "Important: deadline moved"
    ]
    
    failed = []
    
    for subject in automated_subjects:
        if not is_automated_subject(subject):
            failed.append(f"Failed to detect automated subject: {subject}")
    
    for subject in normal_subjects:
        if is_automated_subject(subject):
            failed.append(f"False positive for subject: {subject}")
    
    if failed:
        print("❌ FAIL: Automated subject detection")
        for error in failed:
            print(f"   - {error}")
        return False
    else:
        print("✅ PASS: All automated subject patterns detected correctly")
        return True

def test_should_show_reply_logic():
    """Test should_show_reply function with various scenarios"""
    print("\n🔍 Testing should_show_reply Logic...")
    
    user_email = "testuser@company.com"
    user_settings = {"ignore_newsletters": True, "ignore_notifications": True}
    
    test_cases = [
        {
            "name": "Normal incoming thread",
            "thread": {
                "last_message_from": "client@example.com",
                "from_email": "client@example.com", 
                "subject": "Project discussion",
                "is_dismissed": False,
                "replied_by_user": False,
                "reply_generated": False,
                "status": ""
            },
            "expected_show_reply": True,
            "expected_status": "needs_reply"
        },
        {
            "name": "Dismissed thread",
            "thread": {
                "last_message_from": "client@example.com",
                "from_email": "client@example.com", 
                "subject": "Project discussion",
                "is_dismissed": True,
                "replied_by_user": False,
                "reply_generated": False,
                "status": ""
            },
            "expected_show_reply": False,
            "expected_status": "dismissed"
        },
        {
            "name": "User sent last message",
            "thread": {
                "last_message_from": user_email,
                "from_email": "client@example.com", 
                "subject": "Project discussion",
                "is_dismissed": False,
                "replied_by_user": False,
                "reply_generated": False,
                "status": ""
            },
            "expected_show_reply": False,
            "expected_status": "awaiting_response"
        },
        {
            "name": "Automated sender (noreply)",
            "thread": {
                "last_message_from": "noreply@example.com",
                "from_email": "noreply@example.com", 
                "subject": "Account notification",
                "is_dismissed": False,
                "replied_by_user": False,
                "reply_generated": False,
                "status": ""
            },
            "expected_show_reply": False,
            "expected_status": "automated"
        },
        {
            "name": "Newsletter subject",
            "thread": {
                "last_message_from": "marketing@example.com",
                "from_email": "marketing@example.com", 
                "subject": "Weekly Newsletter - Important Updates",
                "is_dismissed": False,
                "replied_by_user": False,
                "reply_generated": False,
                "status": ""
            },
            "expected_show_reply": False,
            "expected_status": "automated"
        },
        {
            "name": "Already replied by user",
            "thread": {
                "last_message_from": "client@example.com",
                "from_email": "client@example.com", 
                "subject": "Project discussion",
                "is_dismissed": False,
                "replied_by_user": True,
                "reply_generated": False,
                "status": ""
            },
            "expected_show_reply": False,
            "expected_status": "replied"
        },
        {
            "name": "Reply already generated",
            "thread": {
                "last_message_from": "client@example.com",
                "from_email": "client@example.com", 
                "subject": "Project discussion",
                "is_dismissed": False,
                "replied_by_user": False,
                "reply_generated": True,
                "status": ""
            },
            "expected_show_reply": False,
            "expected_status": "reply_pending"
        },
        {
            "name": "Status already set to replied",
            "thread": {
                "last_message_from": "client@example.com",
                "from_email": "client@example.com", 
                "subject": "Project discussion",
                "is_dismissed": False,
                "replied_by_user": False,
                "reply_generated": False,
                "status": "replied"
            },
            "expected_show_reply": False,
            "expected_status": "replied"
        }
    ]
    
    failed = []
    passed = 0
    
    for test_case in test_cases:
        result = should_show_reply(test_case["thread"], user_email, user_settings)
        
        if (result["show_reply"] == test_case["expected_show_reply"] and 
            result["status"] == test_case["expected_status"]):
            print(f"✅ PASS: {test_case['name']}")
            passed += 1
        else:
            failed.append(f"❌ FAIL: {test_case['name']} - Expected show_reply={test_case['expected_show_reply']}, status={test_case['expected_status']}, got show_reply={result['show_reply']}, status={result['status']}")
    
    if failed:
        print(f"\n❌ {len(failed)} test case(s) failed:")
        for error in failed:
            print(f"   {error}")
        return False
    else:
        print(f"\n✅ All {passed} test cases passed!")
        return True

def test_get_thread_status():
    """Test get_thread_status function"""
    print("\n🔍 Testing get_thread_status...")
    
    user_email = "testuser@company.com"
    
    test_cases = [
        {
            "name": "Dismissed thread",
            "thread": {"is_dismissed": True, "replied_by_user": False, "last_message_from": "other@example.com"},
            "followup_status": None,
            "expected": "dismissed"
        },
        {
            "name": "User replied thread",
            "thread": {"is_dismissed": False, "replied_by_user": True, "last_message_from": "other@example.com"},
            "followup_status": None,
            "expected": "replied"
        },
        {
            "name": "Follow-up pending",
            "thread": {"is_dismissed": False, "replied_by_user": False, "last_message_from": "other@example.com"},
            "followup_status": "pending",
            "expected": "follow_up_scheduled"
        },
        {
            "name": "Follow-up sent",
            "thread": {"is_dismissed": False, "replied_by_user": False, "last_message_from": "other@example.com"},
            "followup_status": "sent",
            "expected": "replied"
        },
        {
            "name": "User sent last message",
            "thread": {"is_dismissed": False, "replied_by_user": False, "last_message_from": user_email},
            "followup_status": None,
            "expected": "awaiting_response"
        },
        {
            "name": "Automated sender",
            "thread": {"is_dismissed": False, "replied_by_user": False, "last_message_from": "noreply@example.com", "from_email": "noreply@example.com"},
            "followup_status": None,
            "expected": "automated"
        },
        {
            "name": "Normal thread needs reply",
            "thread": {"is_dismissed": False, "replied_by_user": False, "last_message_from": "client@example.com", "from_email": "client@example.com"},
            "followup_status": None,
            "expected": "needs_reply"
        }
    ]
    
    failed = []
    passed = 0
    
    for test_case in test_cases:
        result = get_thread_status(test_case["thread"], user_email, test_case["followup_status"])
        
        if result == test_case["expected"]:
            print(f"✅ PASS: {test_case['name']}")
            passed += 1
        else:
            failed.append(f"❌ FAIL: {test_case['name']} - Expected {test_case['expected']}, got {result}")
    
    if failed:
        print(f"\n❌ {len(failed)} test case(s) failed:")
        for error in failed:
            print(f"   {error}")
        return False
    else:
        print(f"\n✅ All {passed} test cases passed!")
        return True

def test_filter_threads_for_reply():
    """Test filter_threads_for_reply function"""
    print("\n🔍 Testing filter_threads_for_reply...")
    
    user_email = "testuser@company.com"
    user_settings = {"ignore_newsletters": True, "ignore_notifications": True}
    
    threads = [
        {
            "id": "thread1",
            "subject": "Normal discussion",
            "from_email": "client@example.com",
            "last_message_from": "client@example.com",
            "is_dismissed": False,
            "replied_by_user": False,
            "reply_generated": False,
            "status": ""
        },
        {
            "id": "thread2",
            "subject": "Newsletter update",
            "from_email": "newsletter@company.com",
            "last_message_from": "newsletter@company.com",
            "is_dismissed": False,
            "replied_by_user": False,
            "reply_generated": False,
            "status": ""
        },
        {
            "id": "thread3",
            "subject": "Project update",
            "from_email": "colleague@company.com",
            "last_message_from": user_email,
            "is_dismissed": False,
            "replied_by_user": False,
            "reply_generated": False,
            "status": ""
        }
    ]
    
    filtered_threads = filter_threads_for_reply(threads, user_email, user_settings)
    
    # Check that all threads have the required fields
    required_fields = ["show_reply", "reply_reason", "thread_status"]
    failed = []
    
    for thread in filtered_threads:
        for field in required_fields:
            if field not in thread:
                failed.append(f"Missing field '{field}' in thread {thread.get('id')}")
    
    # Check specific expectations
    if len(filtered_threads) != 3:
        failed.append(f"Expected 3 threads, got {len(filtered_threads)}")
    else:
        # Thread 1 should show reply
        if not filtered_threads[0]["show_reply"]:
            failed.append("Thread 1 should show reply")
        
        # Thread 2 should NOT show reply (newsletter)
        if filtered_threads[1]["show_reply"]:
            failed.append("Thread 2 should NOT show reply (newsletter)")
        
        # Thread 3 should NOT show reply (user sent last message)
        if filtered_threads[2]["show_reply"]:
            failed.append("Thread 3 should NOT show reply (user sent last message)")
    
    if failed:
        print("❌ FAIL: filter_threads_for_reply")
        for error in failed:
            print(f"   - {error}")
        return False
    else:
        print("✅ PASS: filter_threads_for_reply works correctly")
        return True

def main():
    """Run all unit tests"""
    print("🚀 Starting Thread Filter Service Unit Tests\n")
    
    tests = [
        test_automated_sender_detection,
        test_automated_subject_detection,
        test_should_show_reply_logic,
        test_get_thread_status,
        test_filter_threads_for_reply
    ]
    
    passed = 0
    total = len(tests)
    
    for test_func in tests:
        try:
            if test_func():
                passed += 1
        except Exception as e:
            print(f"❌ FAIL: {test_func.__name__} - Exception: {str(e)}")
    
    print("\n" + "="*60)
    print(f"📊 UNIT TEST SUMMARY: {passed}/{total} tests passed")
    print("="*60)
    
    if passed == total:
        print("🎉 All unit tests passed!")
        return 0
    else:
        print(f"❌ {total - passed} test(s) failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())