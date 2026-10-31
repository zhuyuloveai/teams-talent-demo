"""API launcher: uvicorn; host/port come from config (.env)."""
import sys
from pathlib import Path

import uvicorn

# Make the backend root importable (the api/db packages live under backend)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if __name__ == "__main__":
    from config import HOST, PORT

    uvicorn.run(
        "api.main:app",
        host=HOST,
        port=PORT,
    )
