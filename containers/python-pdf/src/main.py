from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import pdfplumber
import io
import base64
from typing import List

app = FastAPI()

class TextBlock(BaseModel):
    text: str
    x0: float
    top: float
    x1: float
    bottom: float
    page_number: int

import base64
from pdf2image import convert_from_bytes

class AnalyzeResponse(BaseModel):
    results: List[TextBlock]
    images: List[str] = [] # List of base64 images, index aligned with page index if text is missing, or sparse? 
                           # Let's use a dictionary or just a list where index = page_number - 1. 
                           # Actually, easiest to return a map of page_number -> base64 string.
                           # But JSON keys must be strings.
                           # Let's return a list of objects or just a dict.
    images_map: dict = {} # map "1" -> "base64..."
    debug_logs: List[str]

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_pdf(file: UploadFile = File(...)):
    logs = []
    logs.append(f"Processing file: {file.filename}")
    
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    content = await file.read()
    logs.append(f"Received file size: {len(content)} bytes")
    
    results = []
    images_map = {}
    
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            logs.append(f"PDF opened. Pages: {len(pdf.pages)}")
            for i, page in enumerate(pdf.pages):
                words = page.extract_words()
                logs.append(f"Page {i+1} words found: {len(words)}")
                
                if len(words) < 5:
                    logs.append(f"Page {i+1} has low text content ({len(words)} words). Converting to image...")
                    try:
                        # Convert specific page to image
                        # pdf2image uses 1-based indexing for first_page/last_page? No, it converts all if not specified.
                        # convert_from_bytes(pdf_file, first_page=None, last_page=None, ...)
                        # We want just this page. i is 0-indexed. Page numbers are 1-indexed.
                        # convert_from_bytes returns a list of PIL images.
                        page_images = convert_from_bytes(content, first_page=i+1, last_page=i+1, fmt='jpeg')
                        if page_images:
                            img = page_images[0]
                            # Convert to base64
                            buffered = io.BytesIO()
                            img.save(buffered, format="JPEG")
                            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
                            images_map[str(i+1)] = img_str
                            logs.append(f"Page {i+1} converted to image.")
                    except Exception as img_err:
                        logs.append(f"Failed to convert page {i+1} to image: {str(img_err)}")

                for word in words:
                    results.append(TextBlock(
                        text=word['text'],
                        x0=word['x0'],
                        top=word['top'],
                        x1=word['x1'],
                        bottom=word['bottom'],
                        page_number=i + 1
                    ))
    except Exception as e:
        logs.append(f"Exception: {str(e)}")
        print(f"Error: {e}")
        # Return partial results if we cached them? No, failure is failure for now.
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

    logs.append(f"Total results: {len(results)}")
    logs.append(f"Total images: {len(images_map)}")
    
    return AnalyzeResponse(results=results, images_map=images_map, debug_logs=logs)

@app.post("/split")
async def split_pdf(file: UploadFile = File(...)):
    # Placeholder for splitting logic if needed, or just return page count
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
        
    content = await file.read()
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            return {"page_count": len(pdf.pages)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
