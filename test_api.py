import requests

# 1. Login to get token
login_url = "http://localhost:8000/api/token/"
data = {"username": "propietario_ba", "password": "admin123"}
res = requests.post(login_url, json=data)

if res.status_code == 200:
    print("Login OK")
    token = res.json().get("access")
    
    # 2. Fetch readings
    readings_url = "http://localhost:8000/energy/readings/"
    headers = {"Authorization": f"Bearer {token}"}
    r_res = requests.get(readings_url, headers=headers)
    
    print(f"Readings status: {r_res.status_code}")
    try:
        print(r_res.json())
    except:
        print(r_res.text)
else:
    print(f"Login failed: {res.status_code}")
    print(res.text)
