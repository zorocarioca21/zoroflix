import os
import sys
import time
import json
import subprocess
from pathlib import Path
from animeDoramaCore import (
    load_state,
    save_state,
    fetch_sitemap_urls,
    extract_episode_meta,
    resolve_video_stream,
    download_video_file,
    detect_video_quality,
    format_title_with_quality,
    report_hybrid_progress,
    clear_hybrid_progress,
    is_worker_paused,
    register_on_vps,
    TEMP_DOWNLOAD_DIR,
    ROOT_DIR
)

UPLOADER_JS = ROOT_DIR / 'backend' / 'scripts' / 'telegramUploadOnly.js'

def upload_via_node(file_path, caption):
    """Executa o upload usando a conexão ativa do Telegram do servidor Zoroflix"""
    # 1. Tenta upload pelo servidor Zoroflix local (compartilha a mesma sessão sem duplicar AUTH_KEY)
    try:
        import urllib.request
        upload_url = "http://127.0.0.1:4000/api/hybrid/upload-anime"
        payload = json.dumps({'filePath': str(file_path), 'caption': str(caption)}).encode('utf-8')
        req = urllib.request.Request(
            upload_url,
            headers={'Content-Type': 'application/json', 'x-api-key': 'cinegeek_hybrid_key_123'},
            data=payload
        )
        with urllib.request.urlopen(req, timeout=3600) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('success') and data.get('messageId'):
                print(f"[Upload] ✅ Upload concluído via Server Telegram Client! MessageID: {data['messageId']}")
                return int(data['messageId'])
            else:
                print(f"[Upload] ⚠️ Servidor retornou: {data}")
    except Exception as server_err:
        print(f"[Upload] ⚠️ Falha ao subir pelo servidor local ({server_err}). Tentando via script fallback...")

    # 2. Fallback: telegramUploadOnly.js nativo
    cmd = ['node', str(UPLOADER_JS), str(file_path), str(caption)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='ignore')
    msg_id = None
    
    for line in proc.stdout:
        print(line, end='')
        m = re.search(r'MessageID:\s*(\d+)', line, re.I)
        if m:
            msg_id = int(m.group(1))
            
    proc.wait()
    return msg_id

import re

def run_worker():
    print("=" * 65)
    print("🚀 WORKER PARALELO: ANIMES & DORAMAS (GOOGLE VIDEO CDN)")
    print("   Total de Sitemaps: 46 (aprox. 46.000 a 50.000 episódios)")
    print("   Trabalha 100% em paralelo com o download da IPTV!")
    print("   Qualidade: Detectada automaticamente via ffprobe (4K, FHD, HD, SD)")
    print("=" * 65)
    
    state = load_state()
    current_sitemap = state.get('current_sitemap', 1)
    processed_urls = state.get('processed_urls', {})
    
    while True:
        if current_sitemap > 46:
            print("[Worker] 🔄 Todos os 46 sitemaps foram verificados! Reiniciando verificação a partir do sitemap 1 para novos lançamentos...")
            current_sitemap = 1
            state['current_sitemap'] = 1
            save_state(state)
            time.sleep(10)

        urls = fetch_sitemap_urls(current_sitemap)
        if not urls:
            print(f"[Worker] Sitemap {current_sitemap} vazio ou inacessível. Avançando...")
            current_sitemap += 1
            state['current_sitemap'] = current_sitemap
            save_state(state)
            time.sleep(2)
            continue

        print(f"[Worker] Encontrados {len(urls)} episódios no sitemap {current_sitemap}. Processando...")
        
        for idx, page_url in enumerate(urls):
            # 1. Verifica se foi pausado pelo botão do painel admin
            while is_worker_paused():
                report_hybrid_progress("Pausado pelo Painel Admin", "Pausado", 0)
                print("\r[Worker] ⏸️ Worker pausado pelo painel admin. Aguardando retomada...", end='', flush=True)
                time.sleep(5)

            if page_url in processed_urls:
                continue
                
            print(f"\n[{idx+1}/{len(urls)}] 🔍 Inspecionando: {page_url}")
            meta = extract_episode_meta(page_url)
            if not meta:
                print(f"   ⏩ Iframe não encontrado ou vídeo indisponível. Pulando.")
                processed_urls[page_url] = {'status': 'skipped', 'reason': 'no_iframe'}
                save_state(state)
                continue
                
            print(f"   📺 {meta['title']} | TMDb: {meta['tmdb_id']} S{meta['season']:02d}E{meta['episode']:02d}")
            
            stream_info = resolve_video_stream(meta['tmdb_id'], meta['season'], meta['episode'])
            if not stream_info:
                print(f"   ⚠️ Não foi possível obter o stream direto. Pulando.")
                processed_urls[page_url] = {'status': 'skipped', 'reason': 'no_stream'}
                save_state(state)
                continue
                
            # Baixa o vídeo temporariamente
            clean_filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', meta['title'])[:50]
            temp_file = TEMP_DOWNLOAD_DIR / f"{clean_filename}_{meta['tmdb_id']}_S{meta['season']}E{meta['episode']}.mp4"
            
            try:
                file_size = download_video_file(stream_info, str(temp_file), meta['title'])
                if file_size < 1024 * 1024:
                    print(f"   ❌ Arquivo muito pequeno ({file_size} bytes). Descartando.")
                    if temp_file.exists(): temp_file.unlink()
                    processed_urls[page_url] = {'status': 'error', 'reason': 'file_too_small'}
                    save_state(state)
                    continue
                
                # 2. Detecção Real de Resolução via ffprobe (igual IPTV / upload manual)
                quality_tag, height = detect_video_quality(temp_file)
                final_title = format_title_with_quality(meta['title'], quality_tag)
                meta['title'] = final_title
                print(f"   🎬 Resolução detectada: {height}p -> Tag: [{quality_tag or 'SD'}]")
                print(f"   🏷️ Título final formatado: \"{final_title}\"")
                
                # 3. Reporta início do upload no painel admin
                report_hybrid_progress(final_title, 'Enviando_Telegram_Anime', 50.0)
                print(f"   ⬆️ Enviando para o canal do Telegram...")
                
                msg_id = upload_via_node(str(temp_file), f"**{final_title}**\nCineGeek Animes")
                
                # Deleta o arquivo temporário do PC
                if temp_file.exists():
                    temp_file.unlink()
                    print(f"   🧹 Arquivo temporário local excluído.")
                    
                if msg_id:
                    print(f"   ✅ Upload concluído! MessageID: {msg_id}")
                    ok = register_on_vps(meta, msg_id, file_size)
                    if ok:
                        print(f"   🌐 Registrado no catálogo oficial da VPS com sucesso!")
                    else:
                        print(f"   ⚠️ Alerta: não foi possível registrar na VPS na hora.")
                        
                    processed_urls[page_url] = {
                        'status': 'completed',
                        'telegram_message_id': msg_id,
                        'file_size': file_size,
                        'tmdb_id': meta['tmdb_id'],
                        'title': final_title,
                        'quality': quality_tag
                    }
                    save_state(state)
                else:
                    print(f"   ❌ Falha no upload para o Telegram.")
                    
            except Exception as loop_err:
                print(f"   ❌ Erro durante processamento do episódio: {loop_err}")
                if temp_file.exists():
                    try: temp_file.unlink()
                    except: pass
            finally:
                clear_hybrid_progress()
                    
            # Pequeno intervalo para gentileza com o servidor
            time.sleep(1)

        print(f"[Worker] ✅ Sitemap {current_sitemap} concluído com sucesso!")
        current_sitemap += 1
        state['current_sitemap'] = current_sitemap
        save_state(state)

if __name__ == '__main__':
    run_worker()
