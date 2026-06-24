import os
import time
import psutil
from dotenv import load_dotenv
from supabase import create_client, Client

# Load credentials from .env (kept out of source control)
load_dotenv()

# Initialize Cloud Database Client (credentials loaded from .env)
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]  # publishable / anon key
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def establish_operator_session():
    """
    Authenticates the background tracking daemon with the user's specific account credentials.
    This guarantees that all uploaded data packets are automatically tagged with your unique user_id.
    """
    print("=" * 60)
    print("    RTX 4060 MATRIX // DAEMON MULTI-TENANT INITIALIZATION    ")
    print("=" * 60)
    
    # Pull credentials from .env first; fall back to console prompt if not set
    email = os.getenv("OPERATOR_EMAIL")
    password = os.getenv("OPERATOR_PASSWORD")

    if email and password:
        print(f"\n🔑 Loaded operator credentials from .env ({email}). Skipping manual login.")
    else:
        email = input("ENTER OPERATOR IDENTITY EMAIL: ")
        password = input("ENTER SECURITY PASSKEY: ")

    try:
        print("\n⚡ Verifying cryptographic signatures with Supabase Auth Gate...")
        session_data = supabase.auth.sign_in_with_password({"email": email, "password": password})
        print("✅ Identity verified! Secure hardware streaming pipeline opened.")
        return session_data.user.id
    except Exception as e:
        print(f"❌ AUTHENTICATION REFUSED: {str(e)}")
        exit(1)

def start_hardware_daemon(user_id: str):
    # Initialize pynvml inside a try-except block to handle Optimus sleep states gracefully
    gpu_monitoring_active = False
    try:
        import pynvml
        pynvml.nvmlInit()
        gpu_handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        gpu_monitoring_active = True
        print("◉ NVIDIA Management Library successfully mapped to RTX 4060.")
    except Exception:
        print("◎ NVIDIA NVML failed to bind or hardware is in D3Cold sleep state.")
        print("  System will report default baselines until a graphics-heavy task runs.")

    print("\n🚀 Core daemon is live. Transmitting packets to cloud matrix every 2 seconds...\n")

    # Establish a network counter baseline so we can derive throughput rates between cycles
    prev_net = psutil.net_io_counters()
    prev_time = time.time()
    first_sample = True  # first loop has a near-zero interval; don't emit a bogus rate spike

    while True:
        try:
            # 1. Harvest Core CPU and RAM Statistics
            cpu = psutil.cpu_percent(interval=None)
            ram = psutil.virtual_memory().percent

            # 2. Harvest Dedicated GPU Statistics
            gpu = 0.0
            vram = 0.0
            temp = 0.0
            gpu_power = 0.0
            gpu_clock = 0.0
            gpu_fan = 0.0

            if gpu_monitoring_active:
                try:
                    util = pynvml.nvmlDeviceGetUtilizationRates(gpu_handle)
                    gpu = float(util.gpu)

                    mem_info = pynvml.nvmlDeviceGetMemoryInfo(gpu_handle)
                    vram = (mem_info.used / mem_info.total) * 100

                    temp = float(pynvml.nvmlDeviceGetTemperature(gpu_handle, 0))

                    # Power draw (mW -> W), core clock (MHz), and fan speed (%)
                    gpu_power = pynvml.nvmlDeviceGetPowerUsage(gpu_handle) / 1000.0
                    gpu_clock = float(pynvml.nvmlDeviceGetClockInfo(gpu_handle, pynvml.NVML_CLOCK_GRAPHICS))
                    try:
                        gpu_fan = float(pynvml.nvmlDeviceGetFanSpeed(gpu_handle))
                    except Exception:
                        gpu_fan = 0.0  # Many laptop GPUs share a chassis fan NVML can't read
                except Exception:
                    # Fall back to zero if laptop Optimus architecture puts the GPU back to sleep
                    gpu, vram, temp = 0.0, 0.0, 0.0
                    gpu_power, gpu_clock, gpu_fan = 0.0, 0.0, 0.0

            # 3. Harvest Disk, Network throughput, and Battery Statistics
            disk = psutil.disk_usage("C:\\").percent

            now = time.time()
            curr_net = psutil.net_io_counters()
            elapsed = max(now - prev_time, 0.001)
            # Clamp deltas to >= 0 so a counter reset / NIC reset / wrap can't emit negative rates
            up_delta = max(curr_net.bytes_sent - prev_net.bytes_sent, 0)
            down_delta = max(curr_net.bytes_recv - prev_net.bytes_recv, 0)
            if first_sample:
                net_up = net_down = 0.0
                first_sample = False
            else:
                net_up = up_delta / elapsed / 1024.0      # KB/s
                net_down = down_delta / elapsed / 1024.0  # KB/s
            prev_net, prev_time = curr_net, now

            battery_pct = 0.0
            battery_charging = False
            batt = psutil.sensors_battery()
            if batt is not None:
                battery_pct = float(batt.percent)
                battery_charging = bool(batt.power_plugged)

            # 4. Structural Package Generation
            payload = {
                "cpu_usage": cpu,
                "ram_usage": ram,
                "gpu_usage": gpu,
                "vram_usage": vram,
                "gpu_temp": temp,
                "disk_usage": disk,
                "net_up": round(net_up, 2),
                "net_down": round(net_down, 2),
                "battery_pct": battery_pct,
                "battery_charging": battery_charging,
                "gpu_power": round(gpu_power, 1),
                "gpu_clock": gpu_clock,
                "gpu_fan": gpu_fan,
                "user_id": user_id # 🔒 Crucial foreign key tag to isolate data rows
            }

            # 5. Ship Packet straight past the Row-Level Security Gates
            supabase.table("telemetry").insert(payload).execute()
            print(f"🚀 Streamed Packet -> CPU: {cpu}% | GPU: {gpu}% | Disk: {disk}% | Net ↓{net_down:.0f}↑{net_up:.0f} KB/s | Batt: {battery_pct:.0f}% [Scoped to User]")

        except Exception as e:
            print(f"⚠️ Telemetry Packet Drop Fault: {str(e)}")

        time.sleep(2)

if __name__ == "__main__":
    # Run authentication step first to secure a unique User ID token
    active_user_id = establish_operator_session()
    # Spin up the tracker loop signed with that ID
    start_hardware_daemon(active_user_id)