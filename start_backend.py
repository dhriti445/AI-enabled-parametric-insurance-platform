#!/usr/bin/env python.exe
import os
import sys

os.chdir(r'c:\Users\dhriti\Downloads\guidewire\backend')
sys.path.insert(0, os.getcwd())

# Start uvicorn
import uvicorn
uvicorn.run('app.main:app', host='127.0.0.1', port=8000, reload=False)
