import os
import sys
import shutil
from pathlib import Path

def clean_cache(target_dir, max_bytes):
    if not os.path.exists(target_dir):
        print(f"Directory {target_dir} does not exist.")
        return

    def get_dir_size(d):
        total = 0
        try:
            for root, dirs, files in os.walk(d):
                for f in files:
                    fp = os.path.join(root, f)
                    if os.path.exists(fp):
                        total += os.path.getsize(fp)
        except Exception:
            pass
        return total

    # Coleta todas as pastas de capítulos
    chapter_dirs = []
    for item in os.listdir(target_dir):
        full_path = os.path.join(target_dir, item)
        if os.path.isdir(full_path) and item.startswith("ch_msg_"):
            try:
                # Usa o atime (último acesso) ou mtime
                stat = os.stat(full_path)
                last_used = max(stat.st_atime, stat.st_mtime)
                chapter_dirs.append((full_path, last_used))
            except Exception:
                pass

    print(f"Total de capitulos em cache: {len(chapter_dirs)}")
    
    # Calcula tamanho total atual
    total_size = sum(get_dir_size(p) for p, _ in chapter_dirs)
    print(f"Tamanho total inicial do cache: {total_size / (1024**3):.2f} GB")

    # Ordena pelos menos acessados / mais antigos primeiro
    chapter_dirs.sort(key=lambda x: x[1])

    removed_count = 0
    for p, _ in chapter_dirs:
        if total_size <= max_bytes:
            break
        dir_sz = get_dir_size(p)
        try:
            shutil.rmtree(p, ignore_errors=True)
            total_size -= dir_sz
            removed_count += 1
        except Exception as e:
            print(f"Erro ao remover {p}: {e}")

    print(f"Removidos {removed_count} capitulos antigos. Novo tamanho: {total_size / (1024**3):.2f} GB")

if __name__ == "__main__":
    cache_path = sys.argv[1] if len(sys.argv) > 1 else "/root/zoroflix/temp_mangas/cache"
    # Limite padrão: 4.5 GB (garantindo que fique sempre abaixo de 5 GB)
    max_gb = float(sys.argv[2]) if len(sys.argv) > 2 else 4.5
    clean_cache(cache_path, int(max_gb * 1024 * 1024 * 1024))
