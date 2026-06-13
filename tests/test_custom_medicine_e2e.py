import subprocess
import time
import sys
from playwright.sync_api import sync_playwright

def run_test():
    # 1. Start backend server on port 8503
    print("Starting PharmaPro backend server...")
    proc = subprocess.Popen([sys.executable, "-m", "backend.main"], 
                            stdout=subprocess.PIPE, 
                            stderr=subprocess.PIPE,
                            text=True)
    
    # Wait for server to start
    time.sleep(3)
    
    success = False
    try:
        with sync_playwright() as p:
            print("Launching browser for Custom Medicine E2E test...")
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width': 1280, 'height': 800})
            page = context.new_page()
            
            # Print console messages from browser
            page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
            page.on("pageerror", lambda err: print(f"Browser Page Error: {err.message}"))
            
            # Go to login page
            page.goto("http://127.0.0.1:8503")
            
            # Authenticate
            print("Authenticating...")
            page.fill('#login-user', 'admin')
            page.fill('#login-pwd', 'admin123')
            page.click('button:has-text("Sign In")')
            
            # Wait for dashboard to load
            page.wait_for_selector('#page-title:has-text("Dashboard")', timeout=5000)
            print("Logged in successfully.")
            
            # Navigate to Billing POS page
            print("Navigating to Billing POS...")
            page.click('button:has-text("Billing")')
            page.wait_for_selector('#bill-search', timeout=5000)
            
            # Search for non-existent medicine
            print("Searching for non-existent medicine...")
            page.fill('#bill-search', 'NonExistentMedXYZ')
            
            # Wait for dropdown to appear and select custom drug addition
            try:
                page.wait_for_selector('text=Custom Medicine', timeout=5000)
                print("Dropdown custom button displayed. Clicking it...")
            except Exception as e:
                # Capture screenshot to diagnose
                print("Timeout waiting for dropdown. Saving screenshot...")
                page.screenshot(path=r"C:\Users\Aniruddh MC\.gemini\antigravity-ide\brain\31239b9c-0791-4f6a-acda-c54a5c28e118\screen.png")
                raise e

            page.click('text=Custom Medicine')
            
            # Verify Modal opens
            page.wait_for_selector('#custom-name', timeout=5000)
            print("Custom medicine modal opened.")
            
            # Verify prefilled name
            name_val = page.locator('#custom-name').input_value()
            assert name_val == 'NonExistentMedXYZ', f"Expected name 'NonExistentMedXYZ', got '{name_val}'"
            
            # Fill form
            page.fill('#custom-brand', 'Cipla E2E')
            page.fill('#custom-mrp-strip', '120.00')
            page.fill('#custom-discount', '10') # 10% discount -> Billing rate = 108.00 per strip (10.80 per tablet)
            page.fill('#custom-qty', '2') # 2 strips -> 20 tablets
            
            # Save
            print("Saving custom medicine...")
            page.click('button:has-text("Save & Add to Bill")')
            
            # Wait for modal to close
            page.wait_for_selector('.modal-overlay', state='detached', timeout=5000)
            print("Modal closed.")
            
            # Verify added to cart
            page.wait_for_selector('text=NonExistentMedXYZ', timeout=5000)
            print("Item verified in billing cart.")
            
            # Click payment mode Card
            page.click('button:has-text("Card")')
            
            # Click Generate Bill
            print("Generating bill...")
            page.click('#bill-gen-btn')
            
            # Wait for transaction complete modal
            page.wait_for_selector('text=Transaction Complete', timeout=5000)
            print("Bill generated successfully!")
            
            success = True
            
    except Exception as e:
        print(f"[-] Custom Medicine E2E Test Failed: {e}")
    finally:
        print("Terminating backend server...")
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            
    if not success:
        sys.exit(1)
    else:
        print("[+] Custom Medicine E2E Test Passed successfully!")

if __name__ == "__main__":
    run_test()
