const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const readline = require('readline');
const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Logging utility
const logger = {
  info: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[INFO][${timestamp}] ${message}`);
    if (data) console.log('Data:', JSON.stringify(data, null, 2));
  },
  error: (message, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR][${timestamp}] ${message}`);
    if (error) {
      console.error('Error details:', error);
      if (error.response) console.error('API Response:', error.response.data);
    }
  },
  debug: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.debug(`[DEBUG][${timestamp}] ${message}`);
    if (data) console.debug('Debug data:', JSON.stringify(data, null, 2));
  },
  warn: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.warn(`[WARN][${timestamp}] ${message}`);
    if (data) console.warn('Warning data:', JSON.stringify(data, null, 2));
  }
};

// Set up readline interface
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

// API configuration
const CLAUDE_API_KEY = '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';
const OPENAI_API_KEY = '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';

const CLAUDE_CONFIG = {
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 4000,
  temperature: 0.3
};

const GPT_CONFIG = {
  model: 'gpt-4o-mini',
  max_tokens: 4000,
  temperature: 0.3
};

const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Helper functions for JSON parsing
function extractJsonContent(content) {
    logger.debug('Extracting JSON from content:', { 
      contentStart: content.substring(0, 100)  // Log first 100 chars
    });
  
    let cleanedContent = content;
    if (content.startsWith('```json')) {
      cleanedContent = content
        .replace(/^```json\n/, '')
        .replace(/\n```$/, '');
    } else if (content.startsWith('```')) {
      cleanedContent = content
        .replace(/^```\n/, '')
        .replace(/\n```$/, '');
    }
  
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
  
    // If no match found with curly braces, try one last cleanup
    cleanedContent = cleanedContent
      .replace(/^[^{]*/, '')  // Remove anything before first {
      .replace(/}[^}]*$/, '}'); // Remove anything after last }
  
    logger.debug('Cleaned content:', { cleanedContent });
    return cleanedContent;
  }
  
  function parseJsonSafely(jsonString) {
    logger.debug('Attempting to parse JSON:', { 
      jsonStart: jsonString.substring(0, 100)  // Log first 100 chars
    });
  
    try {
      // First attempt: direct parse
      return JSON.parse(jsonString);
    } catch (firstError) {
      logger.debug('First parse attempt failed:', { error: firstError.message });
      
      try {
        // Second attempt: handle escaping and special characters
        const preprocessed = jsonString
          // Handle newlines first
          .replace(/\\n/g, '\\n')
          .replace(/\n/g, '\\n')
          // Handle quotes and escaping
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          // Handle other special characters
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
          .replace(/\f/g, '\\f')
          .replace(/[\b]/g, '\\b')
          // Handle Unicode
          .replace(/[\u0000-\u0019]+/g, '')
          // Wrap in quotes if needed
          .replace(/:\s*"([^"]*)"/g, ':"$1"');
  
        logger.debug('Preprocessed JSON:', { 
          preprocessedStart: preprocessed.substring(0, 100)
        });
  
        return JSON.parse(preprocessed);
      } catch (secondError) {
        logger.error('Error in second parsing attempt', {
          error: secondError.message,
          jsonStart: jsonString.substring(0, 100),
          preprocessedStart: preprocessed?.substring(0, 100)
        });
        throw new Error('Failed to parse JSON after preprocessing');
      }
    }
  }

function parseJsonSafely(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    try {
      const preprocessed = jsonString.replace(/\n/g, '\\n')
        .replace(/(?<=:\s*)"([^"]*(?:\\"[^"]*)*)"(?=\s*[,}])/g, (match, p1) => {
          const escaped = p1
            .replace(/"/g, '\\"')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/\f/g, '\\f')
            .replace(/\b/g, '\\b')
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, c => {
              return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
            });
          return `"${escaped}"`;
        });
      
      return JSON.parse(preprocessed);
    } catch (secondError) {
      logger.error('Error in second parsing attempt', secondError);
      throw new Error('Failed to parse JSON even after preprocessing');
    }
  }
}

// Background information for AI responses
const MY_BACKGROUND = `
  Context about Neal Shah:
  - Software Engineer
  - Based in Cary, NC
  - Email: nealmshah11@gmail.com
  - GitHub: github.com/nealshuh
  - LinkedIn: linkedin.com/in/nealmshah
  - Company: Dell Technologies
  - Role: AIOps Engineer for 2 years
  - Phone Number: 5104805592
  I am Male, a US Citizen, not a protected veteran, South Asian and not Hispanic. 
  I do not require sponsorship as I am a US Citizen.
`;

// Field type definitions
const FIELD_TYPES = {
  SIMPLE_DROPDOWN: 'Simple dropdown',
  FILL_IN_BLANK: 'Fill in the blank nothing special',
  LOCATION_SPECIAL: 'Location Special',
  SELECT2_SEARCHABLE: 'select2 bounded searchable',
  SELECT2_SCHOOL: 'select2 unbounded searchable',
  COVER_LETTER: 'Cover letter',
  RESUME_FIELD: 'Resume field',
  EDUCATION_FIELD: 'Education field'
};

// Field identification function (remains exactly the same as your original)
const identifyFieldType = async (field) => {
    try {
      const html = await field.getAttribute('outerHTML');
      const label = await field.findElement(By.css('label')).getText().catch(() => '');
      const fieldId = await field.getAttribute('id') || '';
  
      logger.debug('Field identification started:', {
        label,
        fieldId,
        htmlSnippet: html.substring(0, 200) // First 200 chars for debugging
      });
  
      // Check for EEOC fields
      if (html.includes('data-eeoc-question')) {
        const selectElement = await field.findElement(By.css('select'));
        
        // Race field
        if (fieldId === 'race_dropdown_container') {
          const options = await selectElement.findElements(By.css('option'));
          const visibleOptions = [];
          const hiddenOptions = [];
          
          for (const option of options) {
            const text = await option.getAttribute('innerHTML');
            const isHidden = await option.getAttribute('hidden') === 'hidden';
            if (text && text !== 'Please select') {
              if (isHidden) {
                hiddenOptions.push(text);
              } else {
                visibleOptions.push(text);
              }
            }
          }
          
          const fieldInfo = {
            type: 'EEOC Race',
            label,
            isHidden: html.includes('style="display: none"'),
            visibleOptions,
            hiddenOptions,
            explanation: 'Race selection dropdown (appears after Hispanic/Latino selection)',
            dependsOn: 'hispanic_ethnicity_dropdown_container'
          };
  
          logger.debug('EEOC Race field identified:', fieldInfo);
          return fieldInfo;
        }
  
        // Other EEOC fields
        const options = await selectElement.findElements(By.css('option'));
        const optionTexts = [];
        for (const option of options) {
          const text = await option.getAttribute('innerHTML');
          if (text && text !== 'Please select') {
            optionTexts.push(text);
          }
        }
        
        const fieldInfo = {
          type: 'EEOC Field',
          label,
          options: optionTexts,
          explanation: 'EEOC questionnaire field'
        };
  
        logger.debug('EEOC field identified:', fieldInfo);
        return fieldInfo;
      }
  
      // Check for select2 fields
      if (html.includes('select2-container')) {
        // Security Clearance Debug Section
        if (label.includes('Security Clearance')) {
          logger.debug('=== SECURITY FIELD ANALYSIS START ===');
          logger.debug('Found security field with label:', { label });
          logger.debug('Full field HTML:', { html });
  
          const selectElement = await field.findElement(By.css('select')).catch(err => {
            logger.debug('Error finding base select:', { error: err.message });
            return null;
          });
  
          if (selectElement) {
            logger.debug('Found select element');
            
            const selectHTML = await selectElement.getAttribute('outerHTML');
            logger.debug('Select element HTML:', { selectHTML });
  
            const id = await selectElement.getAttribute('id');
            const name = await selectElement.getAttribute('name');
            const className = await selectElement.getAttribute('class');
            const style = await selectElement.getAttribute('style');
            logger.debug('Select attributes:', { id, name, className, style });
  
            const options = await selectElement.findElements(By.css('option')).catch(err => {
              logger.debug('Error finding options:', { error: err.message });
              return [];
            });
  
            logger.debug('Number of options found:', { count: options.length });
  
            const optionTexts = [];
            for (const option of options) {
              const innerHTML = await option.getAttribute('innerHTML');
              const value = await option.getAttribute('value');
              logger.debug('Option:', { innerHTML, value });
              if (innerHTML && innerHTML !== '--' && innerHTML !== 'Please select') {
                optionTexts.push(innerHTML);
              }
            }
  
            const hasMultiClass = html.includes('select2-container-multi');
            const hasSearchbox = html.includes('select2-with-searchbox');
            const hasSearchField = html.includes('select2-search-field');
            logger.debug('Searchable indicators:', {
              hasMultiClass,
              hasSearchbox,
              hasSearchField
            });
  
            const fieldInfo = {
              type: FIELD_TYPES.SELECT2_SEARCHABLE,
              label,
              isMulti: true,
              options: optionTexts,
              explanation: `Multi-select searchable field with ${optionTexts.length} options: ${optionTexts.join(', ')}`
            };
  
            logger.debug('Security field identified:', fieldInfo);
            return fieldInfo;
          } else {
            logger.debug('No select element found');
          }
          
          logger.debug('=== SECURITY FIELD ANALYSIS END ===');
        }
  
        // School field (special case)
        if (html.includes('school-name') && html.includes('data-url')) {
          const fieldInfo = {
            type: FIELD_TYPES.SELECT2_SCHOOL,
            label,
            explanation: 'School selection with API search'
          };
  
          logger.debug('School field identified:', fieldInfo);
          return fieldInfo;
        }
  
        // Generic select2 field handling
        const selectElement = await field.findElement(By.css('select')).catch(() => null);
        if (selectElement) {
          const options = await selectElement.findElements(By.css('option'));
          const optionTexts = [];
          
          for (const option of options) {
            const text = await option.getAttribute('innerHTML');
            if (text && text !== '--' && text !== 'Please select') {
              optionTexts.push(text);
            }
          }
  
          const isSearchable = html.includes('select2-container-multi') || 
                             html.includes('select2-with-searchbox') ||
                             html.includes('select2-search-field');
  
          if (isSearchable) {
            const fieldInfo = {
              type: FIELD_TYPES.SELECT2_SEARCHABLE,
              label,
              options: optionTexts,
              explanation: `Searchable select2 field with ${optionTexts.length} options`
            };
  
            logger.debug('Generic searchable select2 field identified:', fieldInfo);
            return fieldInfo;
          }
          
          const fieldInfo = {
            type: FIELD_TYPES.SIMPLE_DROPDOWN,
            label,
            options: optionTexts,
            explanation: `Simple dropdown with ${optionTexts.length} options`
          };
  
          logger.debug('Simple dropdown field identified:', fieldInfo);
          return fieldInfo;
        }
      }
  
      // Check for simple dropdown
      if (html.includes('<select')) {
        const selectElement = await field.findElement(By.css('select'));
        const options = await selectElement.findElements(By.css('option'));
        const optionTexts = [];
        
        for (const option of options) {
          const text = await option.getAttribute('innerHTML');
          if (text && text !== '--' && text !== 'Please select') {
            optionTexts.push(text);
          }
        }
  
        const fieldInfo = {
          type: FIELD_TYPES.SIMPLE_DROPDOWN,
          label,
          options: optionTexts,
          explanation: `Simple dropdown with ${optionTexts.length} options`
        };
  
        logger.debug('Simple dropdown field identified:', fieldInfo);
        return fieldInfo;
      }

      if (html.includes('auto-complete') && html.includes('location_autocomplete')) {
        const fieldInfo = {
          type: FIELD_TYPES.LOCATION_SPECIAL,
          label,
          explanation: 'Location field with autocomplete'
        };
    
        logger.debug('Location field identified:', fieldInfo);
        return fieldInfo;
      }
  
      // Default to fill in the blank
      if (html.includes('<input type="text"') || html.includes('<textarea')) {
        const fieldInfo = {
          type: FIELD_TYPES.FILL_IN_BLANK,
          label,
          explanation: 'Basic text input or textarea field'
        };
  
        logger.debug('Fill in blank field identified:', fieldInfo);
        return fieldInfo;
      }
  
      const fieldInfo = {
        type: 'Unknown',
        label,
        explanation: 'Does not match any known patterns'
      };
  
      logger.debug('Unknown field type:', fieldInfo);
      return fieldInfo;
  
    } catch (error) {
      logger.error('Error identifying field type', error);
      return {
        type: 'Error',
        label: 'Error analyzing field',
        explanation: error.message
      };
    }
  };

// Function to create a unique identifier for a field
function createFieldIdentifier(field) {
  // Create a unique identifier using label and type
  return `${field.label}__${field.type}`.trim();
}

// Function to analyze fields with GPT
async function analyzeFieldsWithGPT(fields) {
    logger.info('Analyzing all fields with GPT');

    // Create clean field objects with unique identifiers
    const cleanFields = fields.map(field => {
      const identifier = createFieldIdentifier(field);
      return {
        identifier,
        type: field.type,
        label: field.label,
        options: field.options || [],
        explanation: field.explanation || '',
        isRequired: field.label?.includes('*') || false,
        // Add these for better field identification
        fieldId: field.identifier?.id || field.fieldId,
        htmlType: field.htmlType,
        dependencies: field.dependsOn ? [field.dependsOn] : []
      };
    });
  
    logger.debug('Clean fields for GPT:', { cleanFields });  

  const prompt = `
    Please analyze these job application fields and provide a structured response for each.
    My background: ${MY_BACKGROUND}

    Fields to analyze:
    ${JSON.stringify(cleanFields, null, 2)}

    Follow these rules for different field types:
    1. For "Simple dropdown" or "select2 bounded searchable":
       - Use "selectedOption" field only
       - Must match one of the provided options exactly
    2. For "Fill in the blank nothing special":
       - Use "answer" field only
    3. For EEOC fields:
       - Use "answer" field with exact match to options
    4. For complex fields:
       - Set "isComplex" to true
       - Leave "answer" null for Claude to handle

    Return a strict JSON object with this structure:
    {
      "responses": {
        "[identifier]": {
          "isComplex": boolean,
          "answer": string or null,
          "selectedOption": string or null
        }
      }
    }
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: GPT_CONFIG.model,
      messages: [
        { 
          role: "system", 
          content: "You are a helpful assistant that analyzes job application fields and provides appropriate responses."
        },
        { role: "user", content: prompt }
      ],
      temperature: GPT_CONFIG.temperature,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    logger.debug('Raw GPT response:', { content });
    
    const jsonContent = extractJsonContent(content);
    logger.debug('Extracted JSON content:', { jsonContent });
    
    const parsedContent = parseJsonSafely(jsonContent);
    logger.debug('Parsed content:', { parsedContent });

    return parsedContent.responses || {};
  } catch (error) {
    logger.error('Error in GPT analysis', error);
    throw error;
  }
}

// Function to get Claude's response for complex fields
async function handleComplexFieldsWithClaude(complexFields) {
    logger.info('Handling complex fields with Claude', { 
      count: complexFields.length,
      fields: complexFields.map(f => ({ label: f.label, type: f.type }))
    });
    
    if (complexFields.length === 0) {
      return {};
    }
  
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_CONFIG.model,
        max_tokens: CLAUDE_CONFIG.max_tokens,
        temperature: CLAUDE_CONFIG.temperature,
        messages: [{ 
          role: 'user', 
          content: `
            Please analyze these complex fields and provide responses formatted as a simple JSON object.
            Fields to analyze: ${JSON.stringify(complexFields, null, 2)}
            
            Return ONLY a JSON object in this exact format:
            {
              "responses": {
                "fieldId": "response text",
                ...
              }
            }
          `
        }]
      });
  
      const content = response.content[0].text;
      logger.debug('Claude raw response:', { content });
  
      const jsonContent = extractJsonContent(content);
      logger.debug('Extracted JSON from Claude:', { jsonContent });
  
      return parseJsonSafely(jsonContent);
    } catch (error) {
      logger.error('Error in Claude analysis', error);
      throw error;
    }
  }

// Field handling functions
async function handleSimpleDropdown(driver, field, response) {
    logger.info('Handling simple dropdown', { 
      label: field.label,
      selectedOption: response?.selectedOption
    });
  
    if (!field.element || !response?.selectedOption) {
      logger.warn('Missing element or selectedOption', {
        label: field.label,
        hasElement: !!field.element,
        selectedOption: response?.selectedOption
      });
      return;
    }
  
    try {
      const selectElement = await field.element.findElement(By.css('select'));
      await selectElement.click();
      await driver.sleep(300); // Wait for dropdown to open
  
      const options = await selectElement.findElements(By.css('option'));
      let currentIndex = 0;
      
      // Find target option index
      for (let i = 0; i < options.length; i++) {
        const optionText = await options[i].getText();
        if (optionText === response.selectedOption) {
          currentIndex = i;
          break;
        }
      }
  
      // Arrow down to the correct option
      for (let i = 0; i < currentIndex; i++) {
        await selectElement.sendKeys(Key.ARROW_DOWN);
        await driver.sleep(100 + Math.random() * 50);
      }
  
      await selectElement.sendKeys(Key.RETURN);
      await driver.sleep(200);
      
      // Click outside the dropdown
      await driver.findElement(By.css('body')).click();
  
      logger.debug('Dropdown selection complete', {
        label: field.label,
        value: response.selectedOption
      });
    } catch (error) {
      logger.error('Error handling dropdown', {
        label: field.label,
        error: error.message
      });
    }
  }
  

  async function handleSelect2Searchable(driver, field, response) {
    logger.info('Handling select2 searchable', {
      label: field.label,
      selectedOption: response?.selectedOption
    });
  
    if (!field.element || !response?.selectedOption) {
      logger.warn('Missing element or selectedOption', {
        label: field.label,
        hasElement: !!field.element,
        selectedOption: response?.selectedOption
      });
      return;
    }
  
    try {
      // Find and click the container
      const container = await field.element.findElement(By.css('.select2-container'));
      logger.debug('Found select2 container');
      await container.click();
      await driver.sleep(500);
  
      // Wait for and find the input (now using exact classes)
      const searchInput = await driver.wait(
        until.elementLocated(By.css('input.select2-input')),
        5000
      );
      logger.debug('Found search input');
  
      // Focus the input explicitly
      await driver.executeScript("arguments[0].focus();", searchInput);
      await driver.sleep(500);
  
      // Always use University of Massachusetts Amherst for school fields
      const schoolName = field.type === FIELD_TYPES.SELECT2_SCHOOL 
        ? "University of Massachusetts Amherst"
        : response.selectedOption;
  
      // Type the text
      await searchInput.sendKeys(schoolName);
      await driver.sleep(500);
  
      // First enter to trigger search
      await searchInput.sendKeys(Key.RETURN);
      await driver.sleep(1000);  // Longer wait for search results
  
      // Arrow down to first option
      await searchInput.sendKeys(Key.ARROW_DOWN);
      await driver.sleep(500);
  
      // Final enter to confirm selection
      await searchInput.sendKeys(Key.RETURN);
      await driver.sleep(200);
      
      logger.debug('Select2 selection complete', {
        label: field.label,
        value: schoolName
      });
    } catch (error) {
      logger.error('Error handling select2', {
        label: field.label,
        error: error.message
      });
    }
  }

async function handleFillInBlank(driver, field, response) {
    logger.info('Handling fill in blank', {
      label: field.label,
      hasAnswer: !!response?.answer
    });
  
    if (!field.element || !response?.answer) {
      logger.warn('Missing element or answer', {
        label: field.label,
        hasElement: !!field.element,
        answer: response?.answer
      });
      return;
    }
  
    try {
      const input = await field.element.findElement(By.css('input[type="text"], textarea'));
      await input.click();
      await driver.sleep(200);
      
      // Use the simulateHumanTyping function
      await simulateHumanTyping(input, response.answer, driver);
      
      // Click outside the field
      await driver.findElement(By.css('body')).click();
      
      logger.debug('Text input complete', {
        label: field.label,
        value: response.answer
      });
    } catch (error) {
      logger.error('Error handling text input', {
        label: field.label,
        error: error.message
      });
    }
  }
  

async function handleEEOCField(driver, field, response) {
  logger.info('Handling EEOC field', {
    label: field.label,
    answer: response?.answer
  });

  if (!field.element || !response?.answer) {
    logger.warn('Missing element or answer', {
      label: field.label,
      hasElement: !!field.element,
      answer: response?.answer
    });
    return;
  }

  try {
    const select = await field.element.findElement(By.css('select'));
    await select.sendKeys(response.answer);
    logger.debug('EEOC selection complete', {
      label: field.label,
      value: response.answer
    });
  } catch (error) {
    logger.error('Error handling EEOC field', {
      label: field.label,
      error: error.message
    });
  }
}

// Process all fields
async function processFields(driver, fields) {
  logger.info('Starting batch field processing');

  try {
    // Create identifier map for fields
    const fieldMap = new Map(
      fields.map(field => [createFieldIdentifier(field), field])
    );

    // Get GPT analysis
    const gptResponses = await analyzeFieldsWithGPT(fields);
    logger.debug('GPT Responses received', { gptResponses });

    // Identify complex fields
    const complexFields = fields.filter(field => {
      const identifier = createFieldIdentifier(field);
      return gptResponses[identifier]?.isComplex;
    });

    // Get Claude responses for complex fields
    let claudeResponses = {};
    if (complexFields.length > 0) {
      claudeResponses = await handleComplexFieldsWithClaude(complexFields);
      logger.debug('Claude Responses received', { claudeResponses });
    }

    // Process each field with its response
    for (const [identifier, response] of Object.entries(gptResponses)) {
      const field = fieldMap.get(identifier);
      if (!field) {
        logger.warn('No matching field found for response', { identifier });
        continue;
      }

      // If complex field, use Claude's response
      if (response.isComplex && claudeResponses[identifier]) {
        response.answer = claudeResponses[identifier];
      }

      logger.debug('Processing field', {
        identifier,
        type: field.type,
        response
      });

      // Handle field based on type
      switch (field.type) {
        case FIELD_TYPES.SIMPLE_DROPDOWN:
          await handleSimpleDropdown(driver, field, response);
          break;
        case FIELD_TYPES.SELECT2_SEARCHABLE:
          //await handleSelect2Searchable(driver, field, response);
          handleNothing()
          break;
        case FIELD_TYPES.FILL_IN_BLANK:
          await handleFillInBlank(driver, field, response);
          break;
        case FIELD_TYPES.LOCATION_SPECIAL:
          await handleLocationSpecial(driver, field, response);
          break;
        case FIELD_TYPES.SELECT2_SCHOOL:
          //await handleSelect2Searchable(driver, field, response); // Reuse select2 handler
          handleNothing()
          break;
        case 'EEOC Field':
        case 'EEOC Race':
          await handleEEOCField(driver, field, response);
          break;
        default:
          logger.warn('Unhandled field type', {
            type: field.type,
            label: field.label
          });
      }

      // Add a small delay between fields
      await driver.sleep(500);
    }
  } catch (error) {
    logger.error('Error processing fields', error);
    throw error;
  }
}

const handleNothing = () => {

}

async function simulateHumanTyping(element, text, driver) {
    await element.clear();
    await driver.sleep(50 + Math.random() * 50); // Reduced initial pause
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      // Reduced delays for all characters
      const baseDelay = /[\s.,!?@]/.test(char) ? 20 : 10;
      const randomDelay = Math.random() * 5; // 0-5ms additional random delay
      const delay = baseDelay + randomDelay;
      await element.sendKeys(char);
      await driver.sleep(delay);
    }
    await driver.sleep(50 + Math.random() * 50); // Reduced final pause
  }

  async function handleLocationSpecial(driver, field, response) {
    logger.info('Handling location special field', {
      label: field.label
    });
  
    try {
      const input = await driver.findElement(By.id('auto_complete_input'));
      logger.debug('Found location input');
  
      // Click to focus
      logger.debug('Clicking input...');
      await input.click();
      await driver.sleep(200);
  
      // Type "Cary"
      logger.debug('Typing "Cary"...');
      await simulateHumanTyping(input, 'Cary', driver);
      await driver.sleep(500);
  
      // First enter to trigger location search
      logger.debug('Pressing Enter to search...');
      await input.sendKeys(Key.RETURN);
      await driver.sleep(1000);
  
      // Wait for suggestions popup to be visible
      logger.debug('Waiting for suggestions popup...');
      const popup = await driver.wait(
        until.elementLocated(By.id('location_autocomplete-items-popup')),
        5000
      );
      await driver.wait(until.elementIsVisible(popup), 5000);
      
      // Wait for li elements to be present and visible
      logger.debug('Waiting for suggestions to be loaded...');
      await driver.wait(
        async () => {
          const items = await popup.findElements(By.css('li'));
          if (items.length === 0) return false;
          const firstVisible = await items[0].isDisplayed();
          return firstVisible;
        },
        5000,
        'Timed out waiting for suggestions to be visible'
      );
  
      // Find all list items in the popup
      const suggestions = await popup.findElements(By.css('li'));
      logger.debug(`Found ${suggestions.length} suggestions`);
  
      // Log details about each suggestion
      for (const suggestion of suggestions) {
        const text = await suggestion.getText();
        const isDisplayed = await suggestion.isDisplayed();
        logger.debug(`Suggestion: "${text}" (displayed: ${isDisplayed})`);
      }
  
      // Attempt to click the first visible suggestion
      if (suggestions.length > 0) {
        let clicked = false;
        for (const suggestion of suggestions) {
          if (await suggestion.isDisplayed()) {
            logger.debug('Found visible suggestion, clicking...');
            await driver.wait(until.elementIsEnabled(suggestion), 5000);
            await suggestion.click();
            clicked = true;
            break;
          }
        }
        
        if (!clicked) {
          throw new Error('No visible suggestions found');
        }
      } else {
        throw new Error('No suggestions found');
      }
  
      await driver.sleep(200);
      logger.debug('Location selection complete');
    } catch (error) {
      logger.error('Error handling location field', {
        label: field.label,
        error: error.message,
        stack: error.stack
      });
    }
  }

  async function handleSelect2Searchable(driver, field, response) {
    logger.info('Handling select2 searchable', {
      label: field.label,
      selectedOption: response?.selectedOption
    });
  
    if (!field.element || !response?.selectedOption) {
      logger.warn('Missing element or selectedOption', {
        label: field.label,
        hasElement: !!field.element,
        selectedOption: response?.selectedOption
      });
      return;
    }
  
    try {
      const container = await field.element.findElement(By.css('.select2-container'));
      await container.click();
      await driver.sleep(300);
  
      const options = await driver.findElements(By.css('.select2-results__option'));
      let currentIndex = 0;
  
      // Find target option index
      for (let i = 0; i < options.length; i++) {
        const optionText = await options[i].getText();
        if (optionText === response.selectedOption) {
          currentIndex = i;
          break;
        }
      }
  
      // Arrow down to correct option
      const searchInput = await driver.findElement(By.css('.select2-search__field'));
      for (let i = 0; i < currentIndex; i++) {
        await searchInput.sendKeys(Key.ARROW_DOWN);
        await driver.sleep(100 + Math.random() * 50);
      }
  
      await searchInput.sendKeys(Key.RETURN);
      await driver.sleep(200);
  
      // Click outside
      await driver.findElement(By.css('body')).click();
      
      logger.debug('Select2 selection complete', {
        label: field.label,
        value: response.selectedOption
      });
    } catch (error) {
      logger.error('Error handling select2', {
        label: field.label,
        error: error.message
      });
    }
  }

  async function handleResumeField(driver, field, response) {
    logger.info('Resume field handling skipped as requested');
    return;
  }
  
  async function handleCoverLetterField(driver, field, response) {
    logger.info('Cover letter field handling skipped as requested');
    return;
  }

// Main function to gather and process fields
async function gatherFieldInformation(driver) {
    logger.info('Starting to gather field information');
    const fields = [];
  
    try {
      const containers = await driver.findElements(
        By.css('#main_fields .field, #custom_fields .field, #eeoc_fields .field')
      );
  
      logger.info(`Found ${containers.length} fields to analyze`);
  
      for (const container of containers) {
        try {
          const fieldInfo = await identifyFieldType(container);
          const html = await container.getAttribute('outerHTML');
          
          logger.debug('Field gathered:', {
            label: fieldInfo.label,
            type: fieldInfo.type,
            hasElement: !!container
          });
  
          fields.push({
            ...fieldInfo,
            html,
            element: container
          });
  
        } catch (fieldError) {
          logger.error('Error analyzing individual field', fieldError);
        }
      }
  
    } catch (error) {
      logger.error('Error gathering field information', error);
    }
  
    logger.debug('All fields gathered:', {
      count: fields.length,
      fields: fields.map(f => ({
        label: f.label,
        type: f.type
      }))
    });
  
    return fields;
  }

async function main() {
  logger.info('Starting Greenhouse form handler...');
  
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

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    await driver.quit();
    rl.close();
    process.exit();
  });

  try {
    logger.info('Chrome launched successfully');
    console.log('\nPlease:');
    console.log('1. Navigate to a Greenhouse application form');
    console.log('2. Ensure the form is fully loaded');
    
    await waitForUserInput('\nPress Enter when ready to scan the form...');
    
    // Gather all field information
    const fields = await gatherFieldInformation(driver);
    
    // Process all fields in batch
    await processFields(driver, fields);
    
    logger.info('Form processing completed');
    console.log('\nForm processing completed. Script will keep running until you press Ctrl+C');
    
    await new Promise(() => {});
    
  } catch (error) {
    logger.error('Fatal error in main function', error);
  }
}

main().catch(error => {
  logger.error('Unhandled error in main process', error);
  process.exit(1);
});