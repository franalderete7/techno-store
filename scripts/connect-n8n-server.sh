#!/bin/bash
# Connect to your n8n DigitalOcean server
# Make sure you have SSH key set up: ssh-keygen -t ed25519 -C "your_email@example.com"
# Add your public key to DigitalOcean: Droplet → Access → Add SSH Key

SERVER_IP="45.55.53.53"
SSH_USER="root"  # Change if you use a different user (e.g. ubuntu, your-username)

echo "Connecting to n8n-server at $SERVER_IP..."
ssh "$SSH_USER@$SERVER_IP"
