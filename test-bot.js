const { Builder, By, until } = require('selenium-webdriver');
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

async function getCurrentPage(driver) {
    try {
        const selectedPage = await driver.findElement(By.css('.artdeco-pagination__indicator.selected'));
        const pageButton = await selectedPage.findElement(By.css('button'));
        const pageText = await pageButton.findElement(By.css('span')).getText();
        return parseInt(pageText);
    } catch (error) {
        console.log('Error getting current page:', error.message);
        return 1; // Default to first page if we can't determine
    }
}

async function getMaxPage(driver) {
    try {
        const pageButtons = await driver.findElements(By.css('.artdeco-pagination__indicator--number button'));
        let maxPage = 1;
        
        for (const button of pageButtons) {
            const spanText = await button.findElement(By.css('span')).getText();
            const pageNum = parseInt(spanText);
            if (!isNaN(pageNum) && pageNum > maxPage) {
                maxPage = pageNum;
            }
        }
        
        return maxPage;
    } catch (error) {
        console.log('Error getting max page:', error.message);
        return 1;
    }
}

async function isExternalApplyButton(button) {
    try {
        // Check for external link icon
        const svg = await button.findElement(By.css('svg[data-test-icon="link-external-small"]'));
        
        // Verify the button text is exactly "Apply"
        const buttonText = await button.findElement(By.css('.artdeco-button__text')).getText();
        if (buttonText.trim() !== 'Apply') {
            return false;
        }
        
        // Check for role="link" attribute
        const role = await button.getAttribute('role');
        if (role !== 'link') {
            return false;
        }
        
        return true;
    } catch (error) {
        return false;
    }
}


async function processJobLinksOnPage(driver) {
    // Wait for job listings to load
    await driver.wait(until.elementsLocated(By.css('.scaffold-layout__list-item')), 20000);
    
    // Find all job links
    const links = await driver.findElements(By.css('a.job-card-container__link'));
    console.log(`Found ${links.length} job links on this page`);
    
    // Store the original window handle
    const originalWindow = await driver.getWindowHandle();
    
    for (let i = 0; i < links.length; i++) {
        console.log(`Processing job ${i + 1} of ${links.length}`);
        
        try {
            // Re-find the element to avoid stale element references
            const currentLinks = await driver.findElements(By.css('a.job-card-container__link'));
            await driver.executeScript("arguments[0].click();", currentLinks[i]);
            
            // Wait for job details to load
            await driver.sleep(2000);
            
            // Look for the apply button
            const applyButtons = await driver.findElements(By.css('.jobs-apply-button'));
            
            for (const button of applyButtons) {
                if (await isExternalApplyButton(button)) {
                    console.log('Found external apply button, clicking...');
                    
                    // Click the external apply button
                    await driver.executeScript("arguments[0].click();", button);
                    
                    // Wait for new window to open
                    await driver.sleep(1000);
                    
                    // Get all window handles
                    const handles = await driver.getAllWindowHandles();
                    
                    // If a new window was opened
                    if (handles.length > 1) {
                        // Switch to the new window (last handle in the array)
                        const newWindow = handles[handles.length - 1];
                        await driver.switchTo().window(newWindow);
                        
                        // Check if it's an Ashby URL
                        const currentUrl = await driver.getCurrentUrl();
                        if (currentUrl.includes('jobs.ashbyhq.com')) {
                            console.log('Detected Ashby application form, handling...');
                            await handleAshbyApplication(driver);
                        } else {
                            // For non-Ashby URLs, just wait the standard time
                            console.log('Waiting on external page for 3 seconds...');
                            await driver.sleep(3000);
                        }
                        
                        // Close the external page
                        await driver.close();
                        
                        // Switch back to the original LinkedIn window
                        await driver.switchTo().window(originalWindow);
                        console.log('Returned to LinkedIn');
                    }
                    
                    break; // Exit the button loop after finding and clicking external apply
                }
            }
            
            await driver.sleep(1000); // Brief pause between jobs
            
        } catch (error) {
            console.log(`Error processing job ${i + 1}:`, error.message);
            // Ensure we're on the original window before continuing
            const handles = await driver.getAllWindowHandles();
            if (handles.length > 1) {
                await driver.switchTo().window(originalWindow);
            }
            continue;
        }
    }
}

async function goToNextPage(driver) {
    try {
        const currentPage = await getCurrentPage(driver);
        const nextPageNum = currentPage + 1;
        
        // Find all page buttons
        const pageButtons = await driver.findElements(By.css('.artdeco-pagination__indicator--number button'));
        
        // Look for the next page button
        for (const button of pageButtons) {
            const ariaLabel = await button.getAttribute('aria-label');
            if (ariaLabel === `Page ${nextPageNum}`) {
                // Scroll the button into view before clicking
                await driver.executeScript("arguments[0].scrollIntoView(true);", button);
                await driver.sleep(500); // Brief pause after scrolling
                
                // Click the button
                await driver.executeScript("arguments[0].click();", button);
                
                // Wait for the page to load
                await driver.sleep(2000);
                await driver.wait(until.elementsLocated(By.css('.scaffold-layout__list-item')), 20000);
                
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.log('Error going to next page:', error.message);
        return false;
    }
}

async function openJobLinks() {
    console.log('Starting script...');
    
    const options = new chrome.Options();
    const userDataDir = '/Users/nealshah/Library/Application Support/Google/Chrome';
    
    options.addArguments(
        `--user-data-dir=${userDataDir}`,
        '--profile-directory=Profile 3',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
    );
    
    console.log('Launching Chrome...');
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();
    
    // Handle script termination
    process.on('SIGINT', async () => {
        console.log('\nStopping script...');
        await driver.quit();
        rl.close();
        process.exit();
    });
    
    try {
        console.log('\nChrome is now open. Please:');
        console.log('1. Log in if needed');
        console.log('2. Navigate to your desired LinkedIn jobs page');
        console.log('3. Make sure the job listings are visible');
        
        await waitForUserInput('\nPress Enter when you\'re ready to start processing job links...');
        
        const maxPage = await getMaxPage(driver);
        let currentPage = await getCurrentPage(driver);
        
        console.log(`Starting from page ${currentPage} of ${maxPage}`);
        
        while (currentPage <= maxPage) {
            console.log(`\nProcessing page ${currentPage} of ${maxPage}...`);
            await processJobLinksOnPage(driver);
            
            if (currentPage < maxPage) {
                console.log(`\nMoving to page ${currentPage + 1}...`);
                const success = await goToNextPage(driver);
                if (!success) {
                    console.log('Failed to go to next page. Stopping.');
                    break;
                }
                currentPage = await getCurrentPage(driver);
            } else {
                console.log('\nReached the last page.');
                break;
            }
            
            // Brief pause between pages
            await driver.sleep(2000);
        }
        
        console.log('\nFinished processing all pages');
        console.log('Script will keep running until you press Ctrl + C');
        await new Promise(() => {});
        
    } catch (error) {
        console.error('Error:', error);
    }
}

// HANDLING DIFFERENT APPLICATIONS

async function handleAshbyApplication(driver) {
    try {
        // Wait for the Application tab and click it
        await driver.wait(until.elementLocated(By.css('a[id="job-application-form"]')), 5000);
        const applicationTab = await driver.findElement(By.css('a[id="job-application-form"]'));
        await driver.executeScript("arguments[0].click();", applicationTab);
        await driver.sleep(1000);

        // Handle form fields
        const formFields = await driver.findElements(By.css('.ashby-application-form-field-entry input[type="text"]'));
        
        for (const field of formFields) {
            try {
                const labelElement = await field.findElement(By.xpath('preceding-sibling::label'));
                const labelText = await labelElement.getText();
                const lowercaseLabel = labelText.toLowerCase();

                if (lowercaseLabel.includes('first name')) {
                    await field.sendKeys('Neal');
                } else if (lowercaseLabel.includes('last name')) {
                    await field.sendKeys('Shah');
                } else if (lowercaseLabel.includes('name')) {
                    await field.sendKeys('Neal Shah');
                } else if (lowercaseLabel.includes('full') && lowercaseLabel.includes('name')) {
                    await field.sendKeys('Neal Shah');
                } else if (lowercaseLabel.includes('email') && lowercaseLabel.includes('name')) {
                    await field.sendKeys('nealmshah11@gmail.com');
                } else if (lowercaseLabel.includes('github')) {
                    await field.sendKeys('github.com/nealshuh');
                }
            } catch (fieldError) {
                console.log('Error handling specific field:', fieldError.message);
                continue;
            }
        }

        await driver.sleep(3000);

    } catch (error) {
        console.log('Error handling Ashby application:', error.message);
    }
}

openJobLinks().catch(console.error);