FROM codercom/code-server:latest

USER root
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        python3 \
        build-essential \
        gdb \
        cmake \
        ninja-build \
        clang \
        clangd \
    && mkdir -p /home/coder/project /home/coder/.config/code-server /home/coder/.local/share/code-server/User \
    && printf '%s\n' '{' \
    '  "extensions.autoUpdate": false,' \
    '  "extensions.autoCheckUpdates": false,' \
    '  "update.mode": "none",' \
    '  "code-runner.executorMap": {' \
    '    "cpp": "cd $dir && g++ -Wall -Wextra \\"$fileName\\" -o \\"$fileNameWithoutExt\\" && \\"$dir/$fileNameWithoutExt\\""' \
    '  },' \
    '  "C_Cpp_Runner.cCompilerPath": "/usr/bin/gcc",' \
    '  "C_Cpp_Runner.cppCompilerPath": "/usr/bin/g++",' \
    '  "C_Cpp_Runner.debuggerPath": "/usr/bin/gdb",' \
    '  "C_Cpp_Runner.compilerArgs": []' \
    '}' > /home/coder/.local/share/code-server/User/settings.json \
    && chown -R coder:coder /home/coder \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/coder/project
EXPOSE 8080

USER coder
RUN g++ --version && clang++ --version && cmake --version && gdb --version
RUN code-server --install-extension llvm-vs-code-extensions.vscode-clangd || true
RUN code-server --install-extension ms-vscode.cmake-tools || true

USER root
RUN mkdir -p /opt/computex/extensions-cache-cpp \
    && cp -a /home/coder/.local/share/code-server/extensions/. /opt/computex/extensions-cache-cpp/ 2>/dev/null || true \
    && chown -R coder:coder /opt/computex

USER coder
