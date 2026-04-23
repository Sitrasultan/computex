FROM codercom/code-server:latest

USER root
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        python3 \
        make \
        g++ \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        nodejs \
    && npm install -g \
        npm@latest \
        typescript \
        ts-node \
        pnpm \
        yarn \
        eslint \
        prettier \
        nodemon \
        vite \
        npm-check-updates \
    && mkdir -p /home/coder/project /home/coder/.config/code-server /home/coder/.local/share/code-server/User \
    && printf '%s\n' '{' \
    '  "extensions.autoUpdate": false,' \
    '  "extensions.autoCheckUpdates": false,' \
    '  "update.mode": "none"' \
    '}' > /home/coder/.local/share/code-server/User/settings.json \
    && chown -R coder:coder /home/coder \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/coder/project
EXPOSE 8080

USER coder
RUN node --version && npm --version
RUN code-server --install-extension dbaeumer.vscode-eslint || true
RUN code-server --install-extension esbenp.prettier-vscode || true
RUN code-server --install-extension ms-vscode.vscode-typescript-next || true
RUN code-server --install-extension ritwickdey.LiveServer || true
RUN code-server --install-extension bradlc.vscode-tailwindcss || true

USER root
RUN mkdir -p /opt/computex/extensions-cache-node \
    && cp -a /home/coder/.local/share/code-server/extensions/. /opt/computex/extensions-cache-node/ 2>/dev/null || true \
    && chown -R coder:coder /opt/computex

USER coder
