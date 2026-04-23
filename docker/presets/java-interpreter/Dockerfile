FROM codercom/code-server:latest

USER root
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        python3 \
        openjdk-17-jdk \
        maven \
        gradle \
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
RUN java -version && javac -version && mvn -v && gradle -v
RUN code-server --install-extension redhat.java || true
RUN code-server --install-extension vscjava.vscode-java-debug || true
RUN code-server --install-extension vscjava.vscode-java-test || true
RUN code-server --install-extension vscjava.vscode-maven || true

USER root
RUN mkdir -p /opt/computex/extensions-cache-java \
    && cp -a /home/coder/.local/share/code-server/extensions/. /opt/computex/extensions-cache-java/ 2>/dev/null || true \
    && chown -R coder:coder /opt/computex

USER coder
