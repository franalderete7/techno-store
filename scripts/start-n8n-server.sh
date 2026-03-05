#!/bin/bash
# SSH into the server and start/restart n8n
# Run from Cursor terminal: ./scripts/start-n8n-server.sh

SERVER_IP="45.55.53.53"
SSH_USER="root"  # Change if different

echo "Connecting to n8n-server and starting n8n..."
ssh "$SSH_USER@$SERVER_IP" << 'EOF'
  # If n8n is installed via npm globally:
  if command -v n8n &> /dev/null; then
    cd ~ && n8n start
  # If using PM2:
  elif command -v pm2 &> /dev/null; then
    pm2 start n8n || pm2 restart n8n
  # If using Docker:
  elif command -v docker &> /dev/null; then
    docker start n8n 2>/dev/null || docker compose up -d 2>/dev/null || echo "Check your n8n container name"
  else
    echo "n8n not found. Install with: npm install -g n8n"
  fi
EOF
