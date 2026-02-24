from fastapi import APIRouter
from api.websocket import websocket_endpoint

router = APIRouter()

router.add_api_websocket_route("/ws/story", websocket_endpoint)
