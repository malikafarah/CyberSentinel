import urllib.request
import json
import asyncio

async def test_frontend_data():
    req = urllib.request.Request('https://api.github.com/events') # dummy
    print("Done")
