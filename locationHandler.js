const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const waitForUserInput = (prompt) => {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            resolve(answer);
        });
    });
};

async function debugPageState(driver) {
    console.log('\n=== Page State Debug Info ===');
    
    // Get all elements with id containing 'location'
    const locationElements = await driver.findElements(By.css('[id*="location"]'));
    console.log(`\nFound ${locationElements.length} elements with 'location' in id:`);
    for (const element of locationElements) {
        const id = await element.getAttribute('id');
        const isDisplayed = await element.isDisplayed();
        const isEnabled = await element.isEnabled();
        console.log(`\nElement with id '${id}':`);
        console.log(`- Displayed: ${isDisplayed}`);
        console.log(`- Enabled: ${isEnabled}`);
    }

    // Check for any overlays or modals
    const overlays = await driver.findElements(By.css('.modal, .overlay, [role="dialog"]'));
    console.log(`\nFound ${overlays.length} potential overlays/modals`);
    for (const overlay of overlays) {
        const displayed = await overlay.isDisplayed();
        const classes = await overlay.getAttribute('class');
        console.log(`Overlay: ${classes} (displayed: ${displayed})`);
    }

    // Get page errors from console
    const logs = await driver.manage().logs().get('browser');
    console.log('\nBrowser console logs:');
    logs.forEach(log => console.log(`[${log.level}] ${log.message}`));

    // Check specific input element in detail
    try {
        const input = await driver.findElement(By.css('#auto_complete_input'));
        console.log('\nDetailed input element state:');
        console.log('ID:', await input.getAttribute('id'));
        console.log('Name:', await input.getAttribute('name'));
        console.log('Type:', await input.getAttribute('type'));
        console.log('aria-required:', await input.getAttribute('aria-required'));
        console.log('aria-labelledby:', await input.getAttribute('aria-labelledby'));
        console.log('aria-controls:', await input.getAttribute('aria-controls'));
        console.log('role:', await input.getAttribute('role'));
        console.log('class:', await input.getAttribute('class'));
        console.log('Displayed:', await input.isDisplayed());
        console.log('Enabled:', await input.isEnabled());

        // Check element position
        const location = await input.getRect();
        console.log('\nElement position:');
        console.log('X:', location.x);
        console.log('Y:', location.y);
        console.log('Width:', location.width);
        console.log('Height:', location.height);

        // Check if element is in viewport
        const inViewport = await driver.executeScript(`
            const rect = arguments[0].getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        `, input);
        console.log('In viewport:', inViewport);

        // Check for any overlapping elements
        const overlappingElements = await driver.executeScript(`
            const rect = arguments[0].getBoundingClientRect();
            const elements = document.elementsFromPoint(
                rect.left + rect.width/2,
                rect.top + rect.height/2
            );
            return elements.map(e => ({
                tag: e.tagName,
                id: e.id,
                class: e.className,
                zIndex: window.getComputedStyle(e).zIndex
            }));
        `, input);
        console.log('\nElements at input position (top to bottom):');
        console.log(JSON.stringify(overlappingElements, null, 2));

    } catch (error) {
        console.log('\nError getting input element details:', error.message);
    }

    // Get parent element details
    try {
        const root = await driver.findElement(By.id('location_autocomplete_root'));
        console.log('\nLocation autocomplete root details:');
        console.log('data-required:', await root.getAttribute('data-required'));
        console.log('data-location_provider:', await root.getAttribute('data-location_provider'));
        console.log('data-location_type:', await root.getAttribute('data-location_type'));
    } catch (error) {
        console.log('\nError getting root element details:', error.message);
    }

    console.log('\n=== End Debug Info ===\n');
}

async function switchToActiveWindow(driver) {
    const handles = await driver.getAllWindowHandles();
    console.log(`Found ${handles.length} window handles`);
    
    // Get the current active window handle
    const currentWindowHandle = await driver.getWindowHandle().catch(() => null);
    console.log('Current window handle:', currentWindowHandle);

    // Switch to each window and check if it's the one we want
    for (const handle of handles) {
        try {
            await driver.switchTo().window(handle);
            // Get the current URL to verify we're on the right page
            const currentUrl = await driver.getCurrentUrl();
            console.log(`Checking window ${handle} with URL: ${currentUrl}`);
            
            // If this is a Greenhouse application URL, we're in the right place
            if (currentUrl.includes('greenhouse.io')) {
                console.log('Found Greenhouse application window');
                return true;
            }
        } catch (error) {
            console.log(`Error switching to window ${handle}:`, error.message);
        }
    }
    
    return false;
}

async function verifyLocationField(driver) {
    try {
        // First verify the location root container exists
        const root = await driver.findElement(By.id('location_autocomplete_root'));
        const provider = await root.getAttribute('data-location_provider');
        if (provider !== 'Pelias') {
            throw new Error('Unexpected location provider found');
        }

        // Find the input with a more robust selector
        const input = await driver.findElement(By.css('#location_autocomplete_root #auto_complete_input'));
        const name = await input.getAttribute('name');
        if (name !== 'job_application[location]') {
            throw new Error('Unexpected input field found');
        }

        return true;
    } catch (error) {
        console.log('Location field verification failed:', error.message);
        return false;
    }
}

async function simulateHumanTyping(element, text, driver) {
    // First try to clear using JavaScript
    await driver.executeScript("arguments[0].value = '';", element);
    await driver.sleep(50);
    
    // Then try to clear using Selenium
    await element.clear();
    await driver.sleep(50 + Math.random() * 50);

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const baseDelay = /[\s.,!?@]/.test(char) ? 20 : 10;
        const randomDelay = Math.random() * 5;
        const delay = baseDelay + randomDelay;
        
        try {
            await element.sendKeys(char);
            await driver.sleep(delay);
        } catch (error) {
            console.log(`Error typing character '${char}':`, error.message);
            // Try alternative input method
            await driver.executeScript(`arguments[0].value += '${char}'`, element);
            await driver.sleep(delay);
        }
    }
    await driver.sleep(50 + Math.random() * 50);
}

async function waitForElement(driver, selector, timeout = 10000) {
    console.log(`Waiting for element: ${selector}`);
    try {
        const element = await driver.wait(until.elementLocated(By.css(selector)), timeout);
        await driver.wait(until.elementIsVisible(element), timeout);
        return element;
    } catch (error) {
        throw new Error(`Element ${selector} not found within ${timeout}ms: ${error.message}`);
    }
}

async function main() {
    console.log('Starting location field test...');
    const options = new chrome.Options();
    const userDataDir = '/Users/nealshah/Library/Application Support/Google/Chrome';
    options.addArguments(
        `--user-data-dir=${userDataDir}`,
        '--profile-directory=Profile 3',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
    );

    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    try {
        console.log('Chrome launched successfully');
        console.log('\nPlease navigate to the Greenhouse application form');
        await waitForUserInput('\nPress Enter when ready to handle location field...');

        // Switch to the correct window
        console.log('Switching to active window...');
        const windowFound = await switchToActiveWindow(driver);
        
        if (!windowFound) {
            console.log('Could not find the Greenhouse application window. Please make sure you are on the correct page.');
            return;
        }

        try {
            // Run debug first
            console.log('\nRunning initial page state debug...');
            await debugPageState(driver);

            console.log('Verifying location field...');
            const hasLocationField = await verifyLocationField(driver);
            if (!hasLocationField) {
                console.log('This form does not have a compatible location field. Exiting...');
                return;
            }

            console.log('Location field verified. Proceeding with interaction...');

            // Wait for specific Pelias autocomplete input with extended wait conditions
            const input = await driver.wait(
                until.elementLocated(By.css('#location_autocomplete_root #auto_complete_input')),
                10000
            );
            await driver.wait(until.elementIsEnabled(input), 5000);

            console.log('Found location input');

            // Ensure the element is interactable
            console.log('Scrolling to input...');
            await driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", input);
            await driver.sleep(500);

            // Click to focus with retry mechanism
            console.log('Clicking input...');
            let clickSuccess = false;
            for (let i = 0; i < 3 && !clickSuccess; i++) {
                try {
                    await input.click();
                    clickSuccess = true;
                } catch (error) {
                    console.log(`Click attempt ${i + 1} failed:`, error.message);
                    await driver.sleep(500);
                }
            }

            if (!clickSuccess) {
                console.log('Attempting JavaScript focus as fallback');
                await driver.executeScript("arguments[0].focus();", input);
            }

            await driver.sleep(200);

            // Type "Cary"
            console.log('Typing "Cary"...');
            await simulateHumanTyping(input, 'Cary', driver);
            await driver.sleep(500);

            // Press Enter to trigger location search
            console.log('Pressing Enter to search...');
            await input.sendKeys(Key.RETURN);
            await driver.sleep(1000);

            // Wait for and find suggestions popup
            console.log('Looking for location suggestions popup...');
            try {
                const popup = await waitForElement(
                    driver,
                    '#location_autocomplete-items-popup:not([hidden])',
                    5000
                );

                // Find all suggestions
                const suggestions = await popup.findElements(By.css('li'));
                console.log(`Found ${suggestions.length} suggestions`);

                for (const suggestion of suggestions) {
                    const text = await suggestion.getText();
                    const isDisplayed = await suggestion.isDisplayed();
                    console.log(`Suggestion: "${text}" (displayed: ${isDisplayed})`);
                }

                // Select first suggestion
                if (suggestions.length > 0) {
                    console.log('Clicking first suggestion...');
                    await suggestions[0].click();
                } else {
                    console.log('No suggestions found to click');
                }
            } catch (error) {
                console.log('No suggestions popup found:', error.message);
            }

            // Run debug again after interaction
            console.log('\nRunning final page state debug...');
            await debugPageState(driver);

            console.log('Location field handling completed');
        } catch (error) {
            console.error('Error handling location field:', error);
            
            // Run debug on error
            console.log('\nRunning error state debug...');
            await debugPageState(driver);
        }

        console.log('\nScript completed. Press Ctrl+C to exit.');
        await new Promise(() => {}); // Keep the script running
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await driver.quit();
        rl.close();
    }
}

// Handle clean shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    process.exit();
});

main().catch(console.error);