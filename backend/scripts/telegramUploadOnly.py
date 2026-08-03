import os
import sys
from pathlib import Path
from pyrogram import Client
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)

API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
CHANNEL_ID_STR = os.getenv("TELEGRAM_CHANNEL_ID")
SESSION_STR = os.getenv("TELEGRAM_SESSION")

if not API_ID or not API_HASH or not CHANNEL_ID_STR or not SESSION_STR:
    print("Erro: Variáveis do Telegram ausentes no .env (API_ID, API_HASH, CHANNEL_ID, TELEGRAM_SESSION)")
    sys.exit(1)

CHANNEL_ID = int(CHANNEL_ID_STR)

def progress(current, total):
    print(f"\rUpload progresso: {current * 100 / total:.2f}%", end="")
    sys.stdout.flush()

def main():
    if len(sys.argv) < 2:
        print("Uso: python3 telegramUploadOnly.py /caminho/do/arquivo.mp4")
        sys.exit(1)
        
    file_path = sys.argv[1]
    
    if not os.path.exists(file_path):
        sys.exit(1)
        
    script_dir = Path(__file__).parent.resolve()
    session_name = str(script_dir / "my_account")
    
    app = Client(session_name, session_string=SESSION_STR, api_id=int(API_ID), api_hash=API_HASH)
    
    with app:
        try:
            app.get_chat(CHANNEL_ID)
        except:
            for _ in app.get_dialogs():
                pass

        filename = os.path.basename(file_path)
        app.send_video(
            chat_id=CHANNEL_ID,
            video=file_path,
            caption=f"**{filename}**\nUpload via Zoroflix Sync (Hybrid Worker)",
            supports_streaming=True,
            progress=progress
        )
        print("\nUpload concluído com sucesso!")

if __name__ == "__main__":
    main()
