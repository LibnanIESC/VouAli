# VouAli — Trip Manager (piloto: New York)

VouAli — app de gestão de viagem (PWA) — FastAPI + React, pronto para o Railway.
Estado compartilhado via SQLite: os dois celulares veem/editam o mesmo roteiro.

## Estrutura
- `frontend/` — React + Vite (UI, PWA)
- `backend/` — FastAPI (API `/api/state` + serve o build)
- `Dockerfile` — build multi-stage (Node compila o front, Python serve tudo)

## Rodar local (opcional)
Backend:
    cd backend && pip install -r requirements.txt && DATA_DIR=./data uvicorn main:app --reload
Frontend (outro terminal):
    cd frontend && npm install && npm run dev
Em produção o Railway faz tudo pelo Dockerfile.

## Deploy no Railway
1. Suba este projeto para um repositório no GitHub.
2. railway.app → New Project → Deploy from GitHub repo → selecione o repo.
3. O Railway detecta o `Dockerfile` e faz o build.
4. Settings → Volumes → New Volume, mount path `/app/data`  (persiste os dados).
5. Variables → adicione `TRIP_TOKEN` = uma senha (protege os dados). Opcional.
6. Settings → Networking → Generate Domain.
7. Abra a URL no celular → Compartilhar → Adicionar à Tela de Início (instala o PWA).
8. Namorada: mesma URL + mesma senha (se usar TRIP_TOKEN, abra `SUA_URL/?k=SENHA` uma vez).

## Variáveis de ambiente
- `TRIP_TOKEN` (opcional) — senha; se vazio, sem autenticação.
- `DATA_DIR` — pasta do SQLite (padrão `/app/data`).
- `PORT` — definido automaticamente pelo Railway.
