S H E R L O C K 0.1.2 — Android (Samsung Galaxy S21 / arm64-v8a)
================================================================

Pacote: Sherlock-0.1.2-s21.apk
ID:     com.lughlabs.sherlock
Motor:  Lughnasadh 0.2 (classical UCI, no dispositivo)
ABI:    arm64-v8a apenas (S21 e aparelhos 64-bit modernos)
Visual: LOCKED — herald seal, bone dossier, oxblood letterpress, lamp-black

Assinatura (sideload / debug)
-----------------------------
Keystore: /workspace/tooling/lughnasadh-debug.keystore
Alias:    lughnasadh
Senha:    android
(keystore de desenvolvimento Lughnasadh / Lughlammas — ok para sideload)

Instalação no Galaxy S21
------------------------
1. Copie Sherlock-0.1.2-s21.apk para o telefone (USB, Drive, Messages, etc.).
2. Abra o arquivo APK.
3. Se o Android pedir, permita "Instalar apps desconhecidos" / fontes
   desconhecidas para o app que está abrindo o APK (Arquivos, Chrome, etc.).
4. Confirme a instalação de "S H E R L O C K".
5. Na primeira abertura, o app inicia a mesa de investigação e sobe o
   Lughnasadh 0.2 on-device (sem websocket para o PC).

Como usar (análise / preparação)
--------------------------------
- Hub (ARQUIVO): JOGAR / ANALISAR / TREINAR IA.
- Tabuleiro: mova peças ou cole um FEN e toque em Aplicar.
- NOVA POSIÇÃO: volta ao startpos.
- ANALISAR: no painel de evidências. Escolha profundidade ou movetime.
- Acompanhe depth / score / nodes / nps / PV ao vivo.
- PARAR interrompe a busca; MELHOR LANCE destaca a conclusão.
- Reiniciar motor preserva a posição no tabuleiro.

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
  npm run android:s21
  # → Sherlock-0.1.2-s21.apk (+ /workspace/Sherlock-0.1.2-s21.apk)
