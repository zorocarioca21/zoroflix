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

if not API_ID or not API_HASH or not CHANNEL_ID_STR:
    print("Erro: Variáveis do Telegram ausentes no .env (API_ID, API_HASH, CHANNEL_ID)")
    sys.exit(1)

CHANNEL_ID = int(CHANNEL_ID_STR)

def main():
    if len(sys.argv) < 3:
        print("Uso: python telegramManage.py <action> <message_id> [new_title]")
        print("Actions suportadas: delete, edit")
        sys.exit(1)
        
    action = sys.argv[1]
    message_id = int(sys.argv[2])

    script_dir = Path(__file__).parent.resolve()
    session_name = str(script_dir / "my_account")
    
    app = Client(session_name, api_id=int(API_ID), api_hash=API_HASH)
    
    with app:
        try:
            if action == 'delete':
                app.delete_messages(CHANNEL_ID, message_ids=[message_id])
                print(f"Sucesso: Mensagem {message_id} deletada.")
            elif action == 'edit':
                if len(sys.argv) < 4:
                    print("Erro: novo título não fornecido para edição.")
                    sys.exit(1)
                new_title = sys.argv[3]
                app.edit_message_caption(
                    chat_id=CHANNEL_ID,
                    message_id=message_id,
                    caption=f"**{new_title}**"
                )
                print(f"Sucesso: Mensagem {message_id} editada com novo título '{new_title}'.")
            else:
                print(f"Erro: ação desconhecida '{action}'")
                sys.exit(1)
        except Exception as e:
            print(f"Erro ao tentar {action} mensagem: {e}")
            sys.exit(1)

if __name__ == "__main__":
    main()
