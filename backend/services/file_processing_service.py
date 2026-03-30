"""
File Processing Service
========================
Extract text from PDFs and images for email generation.

Supports:
- PDF files (using PyMuPDF/fitz)
- Images (using Pillow + pytesseract OCR)

COMPLIANCE: This is for email composition assistance only.
No automated sending - user must approve and send via Gmail.
"""

import os
import io
import logging
import tempfile
from typing import Optional, Dict, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

# Check for available libraries
PYMUPDF_AVAILABLE = False
PYTESSERACT_AVAILABLE = False
PIL_AVAILABLE = False

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    logger.warning("[FileProcessing] PyMuPDF not available, PDF processing disabled")

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    logger.warning("[FileProcessing] Pillow not available")

try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    logger.warning("[FileProcessing] pytesseract not available, OCR disabled")


def get_available_processors() -> Dict[str, bool]:
    """Return which file processors are available."""
    return {
        "pdf": PYMUPDF_AVAILABLE,
        "image_ocr": PYTESSERACT_AVAILABLE and PIL_AVAILABLE,
        "image_basic": PIL_AVAILABLE,
    }


async def extract_text_from_file(
    file_content: bytes,
    filename: str,
    mime_type: Optional[str] = None,
) -> Dict:
    """
    Extract text from a file (PDF or image).
    
    Args:
        file_content: Raw file bytes
        filename: Original filename
        mime_type: MIME type if known
        
    Returns:
        Dict with extracted_text, file_type, success, and error fields
    """
    # Determine file type
    file_ext = Path(filename).suffix.lower()
    
    if file_ext == ".pdf" or mime_type == "application/pdf":
        return await extract_text_from_pdf(file_content, filename)
    elif file_ext in [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"]:
        return await extract_text_from_image(file_content, filename)
    elif mime_type and mime_type.startswith("image/"):
        return await extract_text_from_image(file_content, filename)
    else:
        return {
            "extracted_text": "",
            "file_type": "unknown",
            "success": False,
            "error": f"Unsupported file type: {file_ext}",
        }


async def extract_text_from_pdf(
    file_content: bytes,
    filename: str,
) -> Dict:
    """
    Extract text from a PDF file.
    
    Uses PyMuPDF (fitz) for text extraction.
    Falls back to OCR if text extraction fails.
    """
    if not PYMUPDF_AVAILABLE:
        return {
            "extracted_text": "",
            "file_type": "pdf",
            "success": False,
            "error": "PDF processing not available. Please install PyMuPDF: pip install PyMuPDF",
        }
    
    try:
        # Open PDF from bytes
        doc = fitz.open(stream=file_content, filetype="pdf")
        
        text_parts = []
        page_count = len(doc)
        
        for page_num in range(min(page_count, 20)):  # Limit to 20 pages
            page = doc[page_num]
            text = page.get_text()
            if text.strip():
                text_parts.append(f"[Page {page_num + 1}]\n{text}")
        
        doc.close()
        
        extracted_text = "\n\n".join(text_parts)
        
        # If no text extracted, try OCR on first page
        if not extracted_text.strip() and PYTESSERACT_AVAILABLE:
            logger.info(f"[FileProcessing] No text in PDF {filename}, attempting OCR")
            extracted_text = await _pdf_to_ocr(file_content)
        
        return {
            "extracted_text": extracted_text[:10000],  # Limit to 10k chars
            "file_type": "pdf",
            "page_count": page_count,
            "success": bool(extracted_text.strip()),
            "error": "" if extracted_text.strip() else "No text could be extracted from PDF",
        }
        
    except Exception as e:
        logger.error(f"[FileProcessing] PDF extraction failed for {filename}: {e}", exc_info=True)
        return {
            "extracted_text": "",
            "file_type": "pdf",
            "success": False,
            "error": f"PDF extraction failed: {str(e)}",
        }


async def extract_text_from_image(
    file_content: bytes,
    filename: str,
) -> Dict:
    """
    Extract text from an image using OCR.
    
    Uses pytesseract for OCR.
    """
    if not PIL_AVAILABLE:
        return {
            "extracted_text": "",
            "file_type": "image",
            "success": False,
            "error": "Image processing not available. Please install Pillow: pip install pillow",
        }
    
    if not PYTESSERACT_AVAILABLE:
        return {
            "extracted_text": "",
            "file_type": "image",
            "success": False,
            "error": "OCR not available. Please install pytesseract: pip install pytesseract",
        }
    
    try:
        # Open image from bytes
        image = Image.open(io.BytesIO(file_content))
        
        # Convert to RGB if necessary
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        
        # Perform OCR
        extracted_text = pytesseract.image_to_string(image)
        
        # Get image info
        width, height = image.size
        
        return {
            "extracted_text": extracted_text[:10000],  # Limit to 10k chars
            "file_type": "image",
            "image_size": f"{width}x{height}",
            "success": bool(extracted_text.strip()),
            "error": "" if extracted_text.strip() else "No text detected in image",
        }
        
    except Exception as e:
        logger.error(f"[FileProcessing] Image OCR failed for {filename}: {e}", exc_info=True)
        return {
            "extracted_text": "",
            "file_type": "image",
            "success": False,
            "error": f"Image OCR failed: {str(e)}",
        }


async def _pdf_to_ocr(file_content: bytes) -> str:
    """
    Convert PDF pages to images and perform OCR.
    Used as fallback for image-based PDFs.
    """
    if not PYMUPDF_AVAILABLE or not PYTESSERACT_AVAILABLE or not PIL_AVAILABLE:
        return ""
    
    try:
        doc = fitz.open(stream=file_content, filetype="pdf")
        text_parts = []
        
        # Process first 5 pages max
        for page_num in range(min(len(doc), 5)):
            page = doc[page_num]
            # Render page to image
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
            img_data = pix.tobytes("png")
            
            # OCR the image
            image = Image.open(io.BytesIO(img_data))
            text = pytesseract.image_to_string(image)
            if text.strip():
                text_parts.append(f"[Page {page_num + 1}]\n{text}")
        
        doc.close()
        return "\n\n".join(text_parts)
        
    except Exception as e:
        logger.error(f"[FileProcessing] PDF OCR failed: {e}")
        return ""


def validate_file(
    file_content: bytes,
    filename: str,
    max_size_mb: float = 10.0,
) -> Tuple[bool, str]:
    """
    Validate uploaded file.
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Check file size
    size_mb = len(file_content) / (1024 * 1024)
    if size_mb > max_size_mb:
        return False, f"File too large: {size_mb:.1f}MB (max {max_size_mb}MB)"
    
    # Check file type
    file_ext = Path(filename).suffix.lower()
    allowed_extensions = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"]
    
    if file_ext not in allowed_extensions:
        return False, f"Unsupported file type: {file_ext}. Allowed: {', '.join(allowed_extensions)}"
    
    # Basic file signature validation
    if file_ext == ".pdf" and not file_content[:4] == b"%PDF":
        return False, "Invalid PDF file"
    
    if file_ext in [".png"] and not file_content[:8] == b'\x89PNG\r\n\x1a\n':
        return False, "Invalid PNG file"
    
    if file_ext in [".jpg", ".jpeg"] and not file_content[:2] == b'\xff\xd8':
        return False, "Invalid JPEG file"
    
    return True, ""
