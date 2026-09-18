S H E R L O C K 0.1.1 — Android (Samsung Galaxy S21 / arm64-v8a)
================================================================

Pacote: Sherlock-0.1.1-s21.apk
ID:     com.lughlabs.sherlock
Motor:  Lughnasadh 0.2 (classical UCI, no dispositivo)
ABI:    arm64-v8a apenas (S21 e aparelhos 64-bit modernos)

Assinatura (sideload / debug)
-----------------------------
Keystore: /workspace/tooling/lughnasadh-debug.keystore
Alias:    lughnasadh
Senha:    android
(keystore de desenvolvimento Lughnasadh / Lughlammas — ok para sideload)

Instalação no Galaxy S21
------------------------
1. Copie Sherlock-0.1.1-s21.apk para o telefone (USB, Drive, Messages, etc.).
2. Abra o arquivo APK.
3. Se o Android pedir, permita "Instalar apps desconhecidos" / fontes
   desconhecidas para o app que está abrindo o APK (Arquivos, Chrome, etc.).
4. Confirme a instalação de "S H E R L O C K".
5. Na primeira abertura, o app inicia a mesa de investigação e sobe o
   Lughnasadh 0.2 on-device (sem websocket para o PC).

Como usar (análise / preparação)
--------------------------------
- Tabuleiro: mova peças ou cole um FEN e toque em Aplicar.
- NEW POSITION: volta ao startpos.
- ANALYZE: no painel de evidências (direita / abaixo). Escolha profundidade
  (depth) ou movetime, depois ANALYZE.
- Acompanhe depth / score / nodes / nps / PV ao vivo.
- STOP interrompe a busca; BEST MOVE destaca a conclusão.
- Restart reinicia só o motor; a posição no tabuleiro é preservada.

Importante
----------
- Uso: preparação e análise de posições — NÃO é auxílio a trampas em
  partidas ao vivo.
- Motor exclusivo: Lughnasadh 0.2. Sem Stockfish. Sem DroidFish.
- Não depende do servidor Node do PC; o adaptador UCI roda no aparelho
  (ProcessBuilder + liblughnasadh.so).

Smoke / testes sem aparelho
---------------------------
Neste ambiente não há emulador S21. No repositório:

  npm test          # parsers UCI (sem binário)
  npm run smoke     # requer binário Linux do Lughnasadh (desktop)

Guilherme deve instalar o APK no S21 para validar o bridge nativo
(onEngineReady → ANALYZE → info/bestmove).

Rebuild
-------
  cd android && ./scripts/../  (veja scripts/build-android-s21.sh na raiz)
