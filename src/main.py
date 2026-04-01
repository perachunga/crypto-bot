"""
Entry point del bot.
Arranca uvicorn con el FastAPI (api.py) que a su vez lanza el data feed y el engine.
"""
import uvicorn
from config import API_PORT

if __name__ == "__main__":
    print("=" * 50)
    print("  CRYPTO BOT — Paper Trading Mode")
    print("=" * 50)
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=API_PORT,
        reload=False,
        log_level="info",
    )
