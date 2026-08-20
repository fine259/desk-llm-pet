/**
 * LLM API 客户端
 * 兼容 OpenAI API 格式，支持自定义 endpoint
 * 支持 DeepSeek、OpenAI 及其他兼容 API
 */

const https = require('https');
const http = require('http');

/**
 * 发送 LLM 聊天请求
 * @param {Object} config - LLM 配置 { apiEndpoint, apiKey, model, maxTokens, temperature }
 * @param {Array} messages - 消息列表 [{ role: 'user'|'assistant'|'system', content: '...' }]
 * @param {Function} onChunk - 流式响应回调 (chunkText)
 * @returns {Promise<string>} 完整响应文本
 */
function chatCompletion(config, messages, onChunk = null) {
  return new Promise((resolve, reject) => {
    const { apiEndpoint, apiKey, model, maxTokens = 2048, temperature = 0.7 } = config || {};

    if (!apiKey) {
      reject(new Error('API Key 未配置，请在设置中填写 API Key'));
      return;
    }

    if (!apiEndpoint) {
      reject(new Error('API 地址未配置，请在设置中填写 API 地址'));
      return;
    }

    // 解析 URL，自动补全协议
    let urlStr = apiEndpoint.trim();
    if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
      urlStr = 'https://' + urlStr;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(urlStr);
    } catch (e) {
      reject(new Error(`API 地址格式无效: ${apiEndpoint}。请确保地址格式正确，例如 https://api.deepseek.com/v1/chat/completions`));
      return;
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const requestBody = JSON.stringify({
      model: model || 'deepseek-chat',
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
      stream: !!onChunk
    });

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': onChunk ? 'text/event-stream' : 'application/json'
      },
      timeout: 60000
    };

    const req = transport.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errorData = '';
        res.on('data', (chunk) => { errorData += chunk; });
        res.on('end', () => {
          let errorMsg = `API 请求失败 (HTTP ${res.statusCode})`;
          try {
            const parsed = JSON.parse(errorData);
            errorMsg = parsed.error?.message || errorMsg;
          } catch (e) { /* 忽略解析错误 */ }
          reject(new Error(errorMsg));
        });
        return;
      }

      if (onChunk) {
        // 流式响应处理
        let fullText = '';
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                onChunk(content);
              }
            } catch (e) { /* 忽略 */ }
          }
        });

        res.on('end', () => {
          if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullText += content;
                  onChunk(content);
                }
              } catch (e) { /* 忽略 */ }
            }
          }
          resolve(fullText);
        });

        res.on('error', (e) => reject(new Error(`流式响应中断: ${e.message}`)));
      } else {
        // 非流式响应处理
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            const content = parsed.choices?.[0]?.message?.content || '';
            resolve(content);
          } catch (e) {
            reject(new Error('解析 API 响应失败'));
          }
        });
        res.on('error', (e) => reject(new Error(`响应错误: ${e.message}`)));
      }
    });

    req.on('error', (e) => {
      reject(new Error(`网络请求失败: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API 请求超时（60秒）'));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * 测试 API 连接
 */
async function testConnection(config) {
  try {
    await chatCompletion(config, [
      { role: 'user', content: '你好，请回复"连接成功"' }
    ]);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  chatCompletion,
  testConnection
};