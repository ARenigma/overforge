import requests
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import re

app = FastAPI()

class AnalyzeRequest(BaseModel):
    code: str
    language: Optional[str] = None
    userId: Optional[int] = None
    roomName: Optional[str] = None

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "codellama:7b"

@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    # Always use LLM for any prompt, including interview questions
    prompt = request.code
    try:
        response = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False
        })
        data = response.json()
        raw = data.get("response", "").strip()
        q1_match = re.search(r'Q1:.*', raw)
        q2_match = re.search(r'Q2:.*', raw)
        q1 = q1_match.group(0) if q1_match else ''
        q2 = q2_match.group(0) if q2_match else ''
        insight = re.sub(r'Q1:.*', '', raw, count=1)
        insight = re.sub(r'Q2:.*', '', insight, count=1).strip()
        if insight and (q1 or q2):
            insight = insight.strip()
        else:
            insight = ''
        questions = '\n'.join(filter(None, [q1, q2]))
        return {
            "question": questions,
            "insight": insight,
            "type": "llm-generated",
            "context": request.code
        }
    except Exception as e:
        return {
            "question": "",
            "insight": "",
            "type": "error",
            "context": request.code,
            "error": str(e)
        }
