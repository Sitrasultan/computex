FROM codercom/code-server:latest

USER root
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        ca-certificates \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
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
RUN python3 --version && pip3 --version
RUN code-server --install-extension ms-python.python || true

USER root
RUN mkdir -p /opt/computex/extensions-cache \
    && cp -a /home/coder/.local/share/code-server/extensions/. /opt/computex/extensions-cache/ 2>/dev/null || true \
    && chown -R coder:coder /opt/computex

USER coder
