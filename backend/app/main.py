from fastapi import FastAPI

app = FastAPI(
    title="CyberSentinel API",
    description="CyberSentinel Backend API Service",
    version="1.0.0"
)

@app.get("/")
async def root():
    return {"message": "backend running", "status": "ok"}

@app.get("/health")
async def health_check():
    return {"message": "CyberSentinel API is running", "status": "ok"}