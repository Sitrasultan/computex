FROM codercom/code-server:latest

USER root
RUN mkdir -p /home/coder/project /home/coder/.config/code-server /home/coder/.local/share/code-server/User \
    && printf '%s\n' '{' \
    '  "extensions.autoUpdate": false,' \
    '  "extensions.autoCheckUpdates": false,' \
    '  "update.mode": "none"' \
    '}' > /home/coder/.local/share/code-server/User/settings.json \
    && chown -R coder:coder /home/coder

WORKDIR /home/coder/project
EXPOSE 8080

USER coder
RUN if ls /tmp/extensions/*.vsix >/dev/null 2>&1; then \
        for ext in /tmp/extensions/*.vsix; do code-server --install-extension "$ext"; done; \
    fi
EXPOSE 8080
