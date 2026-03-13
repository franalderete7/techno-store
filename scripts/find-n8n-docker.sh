#!/bin/bash
# Find n8n Docker files on the remote server
# Uses same server config as connect-n8n-server.sh

SERVER_IP="45.55.53.53"
SSH_USER="root"

echo "Searching for n8n Docker files on $SERVER_IP..."
echo ""

ssh "$SSH_USER@$SERVER_IP" 'bash -s' << 'REMOTE'
echo "=== Docker Compose files ==="
find /opt /root /home -maxdepth 4 \( -name "docker-compose*.yml" -o -name "docker-compose*.yaml" \) 2>/dev/null | head -20

echo ""
echo "=== Dockerfiles ==="
find /opt /root /home -maxdepth 4 -name "Dockerfile*" 2>/dev/null | head -20

echo ""
echo "=== n8n-related dirs (opt, root, home) ==="
find /opt /root /home -maxdepth 4 -type d -iname "*n8n*" 2>/dev/null

echo ""
echo "=== Contents of /opt/n8n (if exists) ==="
ls -la /opt/n8n 2>/dev/null || echo "  /opt/n8n not found"

echo ""
echo "=== Contents of /opt (top-level) ==="
ls -la /opt 2>/dev/null
REMOTE
