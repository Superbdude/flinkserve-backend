// FlinkServe Backend Startup Script
// This is an alternative entry point that ensures proper initialization

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting FlinkServe Backend Server...');
console.log('📁 Working Directory:', __dirname);

// Set default environment variables if not already set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = process.env.PORT || '5001';

// Start the server using nodemon in development, or node in production
const isDev = process.env.NODE_ENV === 'development';
const command = isDev ? 'nodemon' : 'node';
const args = isDev ? ['server.js'] : ['server.js'];

const serverProcess = spawn(command, args, {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

serverProcess.on('error', (error) => {
  console.error('❌ Failed to start server:', error.message);
  if (error.code === 'ENOENT') {
    console.error(`Make sure ${command} is installed. Run: npm install`);
  }
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  if (code !== 0) {
    console.log(`Server process exited with code ${code}`);
  }
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  serverProcess.kill('SIGTERM');
});
