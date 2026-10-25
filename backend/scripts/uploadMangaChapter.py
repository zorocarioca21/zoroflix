import os
import sys
from pathlib import Path
from pyrogram import Client
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)

API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
MANGA_CHANNEL_ID_STR = os.getenv("TELEGRAM_MANGA_CHANNEL_ID")

if not API_ID or not API_HASH or not MANGA_CHANNEL_ID_STR:
    print("Erro: Variáveis do Telegram ausentes no .env (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_MANGA_CHANNEL_ID)")
    sys.exit(1)

CHANNEL_ID = int(MANGA_CHANNEL_ID_STR)

def progress(current, total):
    print(f"\rUpload progresso: {current * 100 / total:.2f}%", end="")
    sys.stdout.flush()

def main():
    if len(sys.argv) < 2:
        print("Uso: python uploadMangaChapter.py <caminho_do_cbz> [caption]")
        sys.exit(1)
        
    file_path = sys.argv[1]
    caption = sys.argv[2] if len(sys.argv) > 2 else Path(file_path).name

    if not os.path.exists(file_path):
        print(f"Erro: Arquivo {file_path} não encontrado.")
        sys.exit(1)

    print(f"Iniciando upload de documento: {file_path} via Pyrogram...")
    
    script_dir = Path(__file__).parent.resolve()
    session_name = str(script_dir / "my_account")
    
    app = Client(session_name, api_id=int(API_ID), api_hash=API_HASH)
    
    with app:
        try:
            app.get_chat(CHANNEL_ID)
        except Exception:
            for _ in app.get_dialogs():
                pass

        msg = app.send_document(
            chat_id=CHANNEL_ID,
            document=file_path,
            caption=caption,
            progress=progress
        )
        print(f"\nUpload concluído com sucesso! MESSAGE_ID: {msg.id}")

if __name__ == "__main__":
    main()
