"""
Email Service - Brevo (Sendinblue) Integration
===============================================
Handles sending transactional emails via Brevo API.
Used for contact form submissions and system notifications.
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Import Brevo SDK
try:
    import sib_api_v3_sdk
    from sib_api_v3_sdk.rest import ApiException
    BREVO_AVAILABLE = True
except ImportError:
    logger.warning("Brevo SDK not installed. Email functionality will be limited.")
    BREVO_AVAILABLE = False


def send_contact_email(name: str, email: str, message: str) -> bool:
    """
    Send contact form submission email to hello@replyzenai.com via Brevo.
    
    Args:
        name: Contact's name
        email: Contact's email
        message: Message content
        
    Returns:
        True if email sent successfully, False otherwise
    """
    if not BREVO_AVAILABLE:
        logger.error("Brevo SDK not available. Cannot send email.")
        return False
    
    brevo_api_key = os.getenv("BREVO_API_KEY", "")
    if not brevo_api_key:
        logger.error("BREVO_API_KEY not configured in environment variables")
        return False
    
    try:
        # Configure Brevo API
        configuration = sib_api_v3_sdk.Configuration()
        configuration.api_key['api-key'] = brevo_api_key
        
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
            sib_api_v3_sdk.ApiClient(configuration)
        )
        
        # Email sender (verified in Brevo)
        sender = {
            "name": "Replyzen AI",
            "email": "hello@replyzenai.com"
        }
        
        # Email recipient
        to = [
            {
                "email": "hello@replyzenai.com",
                "name": "Replyzen Support"
            }
        ]
        
        # Email subject
        subject = f"New Contact Form Submission from {name}"
        
        # HTML email content
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #EA580C;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }}
                .content {{
                    background-color: #f9f9f9;
                    padding: 20px;
                    border: 1px solid #ddd;
                    border-radius: 0 0 5px 5px;
                }}
                .field {{
                    margin-bottom: 15px;
                }}
                .field strong {{
                    color: #EA580C;
                }}
                .message-box {{
                    background-color: white;
                    padding: 15px;
                    border-left: 4px solid #EA580C;
                    margin-top: 10px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>📬 New Contact Form Submission</h2>
                </div>
                <div class="content">
                    <div class="field">
                        <strong>Name:</strong> {name}
                    </div>
                    <div class="field">
                        <strong>Email:</strong> <a href="mailto:{email}">{email}</a>
                    </div>
                    <div class="field">
                        <strong>Message:</strong>
                        <div class="message-box">
                            {message.replace(chr(10), '<br>')}
                        </div>
                    </div>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p style="font-size: 12px; color: #666;">
                        This email was sent from the Replyzen AI contact form.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version (fallback)
        text_content = f"""
        New Contact Form Submission
        
        Name: {name}
        Email: {email}
        
        Message:
        {message}
        
        ---
        This email was sent from the Replyzen AI contact form.
        """
        
        # Create email object
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=to,
            sender=sender,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            reply_to={"email": email, "name": name}  # Allow direct reply to sender
        )
        
        # Send email via Brevo API
        api_response = api_instance.send_transac_email(send_smtp_email)
        
        logger.info(f"Contact email sent successfully. Message ID: {api_response.message_id}")
        return True
        
    except ApiException as e:
        logger.error(f"Brevo API error: {e}")
        return False
    except Exception as e:
        logger.error(f"Failed to send contact email: {e}", exc_info=True)
        return False


def send_notification_email(
    to_email: str,
    to_name: str,
    subject: str,
    message: str,
    html_message: Optional[str] = None
) -> bool:
    """
    Send a notification email to a user.
    
    Args:
        to_email: Recipient email
        to_name: Recipient name
        subject: Email subject
        message: Plain text message
        html_message: Optional HTML version of message
        
    Returns:
        True if email sent successfully, False otherwise
    """
    if not BREVO_AVAILABLE:
        logger.error("Brevo SDK not available. Cannot send email.")
        return False
    
    brevo_api_key = os.getenv("BREVO_API_KEY", "")
    if not brevo_api_key:
        logger.error("BREVO_API_KEY not configured in environment variables")
        return False
    
    try:
        configuration = sib_api_v3_sdk.Configuration()
        configuration.api_key['api-key'] = brevo_api_key
        
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
            sib_api_v3_sdk.ApiClient(configuration)
        )
        
        sender = {
            "name": "Replyzen AI",
            "email": "hello@replyzenai.com"
        }
        
        to = [{"email": to_email, "name": to_name}]
        
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=to,
            sender=sender,
            subject=subject,
            text_content=message,
            html_content=html_message or message.replace('\n', '<br>')
        )
        
        api_response = api_instance.send_transac_email(send_smtp_email)
        
        logger.info(f"Notification email sent to {to_email}. Message ID: {api_response.message_id}")
        return True
        
    except ApiException as e:
        logger.error(f"Brevo API error: {e}")
        return False
    except Exception as e:
        logger.error(f"Failed to send notification email: {e}", exc_info=True)
        return False
