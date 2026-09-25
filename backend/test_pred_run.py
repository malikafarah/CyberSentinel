import httpx
import asyncio

async def test_run():
    # Assume backend is running on 8000 or 8001?
    # Let's try 8001
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post("http://localhost:8001/api/v1/predictions/run", json={"prediction_horizon_hours": 24, "include_graph_features": False, "max_candidates": 50})
            print(resp.status_code)
            print(resp.json())
        except Exception as e:
            print("Failed on 8001:", e)
        
        try:
            resp = await client.post("http://localhost:8000/api/v1/predictions/run", json={"prediction_horizon_hours": 24, "include_graph_features": False, "max_candidates": 50})
            print(resp.status_code)
            print(resp.json())
        except Exception as e:
            print("Failed on 8000:", e)

if __name__ == "__main__":
    asyncio.run(test_run())
