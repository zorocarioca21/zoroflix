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
    print("Erro: Variáveis do Telegram ausentes no .env")
    sys.exit(1)

CHANNEL_ID = int(MANGA_CHANNEL_ID_STR)

def main():
    if len(sys.argv) < 2:
        print("Uso: python deleteMangaMessages.py <message_id_1> [message_id_2] ...")
        sys.exit(1)
        
    message_ids = [int(mid) for mid in sys.argv[1:] if mid.isdigit()]
    if not message_ids:
        sys.exit(0)

    script_dir = Path(__file__).parent.resolve()
    session_name = str(script_dir / "my_account")
    
    app = Client(session_name, api_id=int(API_ID), api_hash=API_HASH)
    
    with app:
        try:
            try:
                app.get_chat(CHANNEL_ID)
            except Exception:
                for _ in app.get_dialogs(): pass

            app.delete_messages(chat_id=CHANNEL_ID, message_ids=message_ids)
            print(f"Sucesso: Mensagens {message_ids} deletadas do canal de mangás.")
        except Exception as e:
            print(f"Erro ao deletar mensagens no Telegram: {e}")
            sys.exit(1)

if __name__ == "__main__":
    main()
