const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const mimeTypes = require('mime-types');

class FileParserService {
  
  constructor() {
    // Supported file types with their MIME types
    this.supportedTypes = {
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/msword': 'doc' // Legacy DOC files (limited support)
    };
    
    // Maximum file size (1MB in bytes)
    this.maxFileSize = 1024 * 1024; // 1MB
  }
  
  /**
   * Validate file before processing
   * @param {Object} file - Multer file object
   * @returns {Object} - Validation result
   */
  validateFile(file) {
    const errors = [];
    
    // Check file size
    if (file.size > this.maxFileSize) {
      errors.push(`File size ${(file.size / (1024 * 1024)).toFixed(2)}MB exceeds maximum limit of 1MB`);
    }
    
    // Check file type
    const fileType = this.supportedTypes[file.mimetype];
    if (!fileType) {
      errors.push(`Unsupported file type: ${file.mimetype}. Supported types: PDF, TXT, DOCX`);
    }
    
    // Check file name
    if (!file.originalname || file.originalname.length > 500) {
      errors.push('Invalid file name');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      fileType,
      sizeInMB: (file.size / (1024 * 1024)).toFixed(2)
    };
  }
  
  /**
   * Extract text from uploaded file
   * @param {Object} file - Multer file object
   * @returns {Promise<Object>} - Extraction result
   */
  async extractText(file) {
    const startTime = Date.now();
    
    try {
      // Validate file first
      const validation = this.validateFile(file);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.errors.join('; '),
          extractedText: '',
          processingTime: Date.now() - startTime
        };
      }
      
      let extractedText = '';
      let extractionMethod = '';
      
      // Extract text based on file type
      switch (validation.fileType) {
        case 'pdf': {
          const pdfResult = await this.extractFromPDF(file.buffer);
          extractedText = pdfResult.text;
          extractionMethod = 'pdf_parse';
          break;
        }

        case 'txt':
          extractedText = await this.extractFromText(file.buffer);
          extractionMethod = 'direct_text';
          break;

        case 'docx': {
          const docxResult = await this.extractFromDOCX(file.buffer);
          extractedText = docxResult.text;
          extractionMethod = 'mammoth_docx';
          break;
        }

        default:
          throw new Error(`Unsupported file type: ${validation.fileType}`);
      }
      
      // Clean and validate extracted text
      const cleanedText = this.cleanExtractedText(extractedText);
      const textValidation = this.validateExtractedText(cleanedText);
      
      const processingTime = Date.now() - startTime;
      
      if (!textValidation.isValid) {
        return {
          success: false,
          error: textValidation.error,
          extractedText: cleanedText,
          extractionMethod,
          processingTime,
          textLength: cleanedText.length
        };
      }
      
      return {
        success: true,
        extractedText: cleanedText,
        extractionMethod,
        processingTime,
        textLength: cleanedText.length,
        wordCount: this.countWords(cleanedText),
        fileInfo: {
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          type: validation.fileType
        }
      };
      
    } catch (error) {
      console.error('Error extracting text from file:', error);
      return {
        success: false,
        error: `Text extraction failed: ${error.message}`,
        extractedText: '',
        processingTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * Extract text from PDF file
   * @param {Buffer} buffer - File buffer
   * @returns {Promise<Object>} - PDF parse result
   */
  async extractFromPDF(buffer) {
    try {
      const pdfData = await pdfParse(buffer, {
        // PDF parsing options
        max: 0, // Parse all pages
        version: 'v1.10.100'
      });
      
      return {
        text: pdfData.text,
        pages: pdfData.numpages,
        info: pdfData.info
      };
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }
  
  /**
   * Extract text from plain text file
   * @param {Buffer} buffer - File buffer
   * @returns {Promise<string>} - Extracted text
   */
  async extractFromText(buffer) {
    try {
      // Try different encodings
      const encodings = ['utf8', 'latin1', 'ascii'];
      
      for (const encoding of encodings) {
        try {
          const text = buffer.toString(encoding);
          // Check if text contains reasonable characters
          if (this.isValidTextEncoding(text)) {
            return text;
          }
        } catch (err) {
          console.log(`Failed to decode with ${encoding}:`, err.message);
        }
      }
      
      // Fallback to UTF-8
      return buffer.toString('utf8');
    } catch (error) {
      throw new Error(`Text file parsing failed: ${error.message}`);
    }
  }
  
  /**
   * Extract text from DOCX file
   * @param {Buffer} buffer - File buffer
   * @returns {Promise<Object>} - Mammoth parse result
   */
  async extractFromDOCX(buffer) {
    try {
      const result = await mammoth.extractRawText({
        buffer: buffer
      });
      
      if (result.messages && result.messages.length > 0) {
        console.log('DOCX parsing messages:', result.messages);
      }
      
      return {
        text: result.value,
        messages: result.messages
      };
    } catch (error) {
      throw new Error(`DOCX parsing failed: ${error.message}`);
    }
  }
  
  /**
   * Clean extracted text
   * @param {string} text - Raw extracted text
   * @returns {string} - Cleaned text
   */
  cleanExtractedText(text) {
    if (!text) return '';
    
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove control characters except newlines and tabs
      // eslint-disable-next-line no-control-regex -- intentional: stripping control chars from parsed document text
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Trim whitespace
      .trim();
  }
  
  /**
   * Validate extracted text for JD processing
   * @param {string} text - Extracted text
   * @returns {Object} - Validation result
   */
  validateExtractedText(text) {
    if (!text || text.length < 50) {
      return {
        isValid: false,
        error: 'Extracted text is too short (minimum 50 characters required for JD analysis)'
      };
    }
    
    if (text.length > 50000) {
      return {
        isValid: false,
        error: 'Extracted text is too long (maximum 50,000 characters for processing efficiency)'
      };
    }
    
    // Check if text contains job-related keywords
    const jobKeywords = [
      'job', 'position', 'role', 'responsibilities', 'requirements', 
      'experience', 'skills', 'qualifications', 'candidate', 'apply',
      'company', 'team', 'work', 'employment', 'hire', 'hiring'
    ];
    
    const textLower = text.toLowerCase();
    const foundKeywords = jobKeywords.filter(keyword => textLower.includes(keyword));
    
    if (foundKeywords.length < 3) {
      return {
        isValid: false,
        error: 'Text does not appear to be a job description (insufficient job-related keywords found)'
      };
    }
    
    return {
      isValid: true,
      foundKeywords,
      textLength: text.length,
      estimatedWords: this.countWords(text)
    };
  }
  
  /**
   * Check if text encoding is valid
   * @param {string} text - Text to check
   * @returns {boolean} - True if encoding seems valid
   */
  isValidTextEncoding(text) {
    // Check for too many replacement characters (indicates bad encoding)
    const replacementChars = (text.match(/\uFFFD/g) || []).length;
    const replacementRatio = replacementChars / text.length;
    
    // If more than 5% replacement characters, encoding is probably wrong
    return replacementRatio < 0.05;
  }
  
  /**
   * Count words in text
   * @param {string} text - Text to count
   * @returns {number} - Word count
   */
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }
  
  /**
   * Generate file hash for deduplication
   * @param {Buffer} buffer - File buffer
   * @returns {string} - SHA-256 hash
   */
  generateFileHash(buffer) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
  
  /**
   * Get supported file types for client
   * @returns {Object} - Supported types info
   */
  getSupportedTypes() {
    return {
      mimeTypes: Object.keys(this.supportedTypes),
      extensions: Object.values(this.supportedTypes),
      maxSizeMB: this.maxFileSize / (1024 * 1024),
      maxSizeBytes: this.maxFileSize
    };
  }
}

module.exports = new FileParserService(); 