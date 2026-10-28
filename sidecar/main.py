from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from bca_parser import ParseError, parse_bca

app = FastAPI(title="pembukuan-sidecar")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/parse")
async def parse(file: UploadFile = File(...)):
    data = await file.read()  # tetap di memori; tidak pernah ditulis ke disk
    if not data.startswith(b"%PDF"):
        return JSONResponse(status_code=422, content={"reason": "unreadable", "detail": "Bukan file PDF"})
    try:
        statement = parse_bca(data)
    except ParseError as exc:
        return JSONResponse(status_code=422, content={"reason": exc.reason, "detail": exc.detail})
    return statement.to_dict()
