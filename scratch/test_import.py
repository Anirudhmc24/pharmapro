
try:
    from backend.routers.drugs import router
    print("Successfully imported drugs router")
except Exception as e:
    import traceback
    traceback.print_exc()
