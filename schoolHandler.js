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

async function main() {
    console.log('Starting school field test...');
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
        await waitForUserInput('\nPress Enter when ready to test school field...');

        // Switch to the correct window
        console.log('Switching to active window...');
        const windowFound = await switchToActiveWindow(driver);
        
        if (!windowFound) {
            console.log('Could not find the Greenhouse application window. Please make sure you are on the correct page.');
            return;
        }

        try {
            console.log('Starting school field interaction...');

            // First click the container to ensure the dropdown opens
            const container = await driver.findElement(By.css('#s2id_education_school_name_0'));
            await container.click();
            console.log('Clicked container');
            await driver.sleep(500);

            // Find the input by exact class combination
            const input = await driver.findElement(
                By.css('input.select2-input.select2-focused')
            );
            console.log('Found input element');

            // Focus input explicitly
            await driver.executeScript("arguments[0].focus();", input);
            console.log('Focused input');
            await driver.sleep(500);

            // Type the school name
            await input.sendKeys('University of Massachusetts');
            console.log('Typed school name');
            await driver.sleep(1000); // Wait longer for results

            // Log the available options
            const options = await driver.findElements(By.css('.select2-result-label'));
            console.log(`Found ${options.length} options`);

            // Look for the Amherst option
            for (const option of options) {
                const text = await option.getText();
                console.log(`Found option: ${text}`);
                if (text.includes('Amherst')) {
                    console.log('Found Amherst option, clicking...');
                    await option.click();
                    console.log('Selected Amherst option');
                    await driver.sleep(500);
                    return;
                }
            }

            // If we didn't find Amherst in the options, use the original arrow-down method
            console.log('Amherst option not found, using arrow navigation...');
            await input.sendKeys(Key.ARROW_DOWN);
            await driver.sleep(500);
            await input.sendKeys(Key.RETURN);
            console.log('Used arrow navigation as fallback');
        } catch (error) {
            console.error('Error handling school field:', error);
        }

        console.log('\nScript completed. Press Ctrl+C to exit.');
        await new Promise(() => {});
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await driver.quit();
        rl.close();
    }
}

process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    process.exit();
});

main().catch(console.error);