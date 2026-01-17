// GPT/Gemini 消息导航插件 - 核心脚本

class MessageNavigator {
  constructor() {
    this.messages = [];
    this.messageTexts = new Set(); // 用于去重的文本集合
    this.messageElements = new WeakSet(); // 用于去重的元素集合
    this.navContainer = null;
    this.navList = null;
    this.currentHighlight = null;

    // 检测当前平台
    const hostname = window.location.hostname;
    this.isGemini = hostname.includes('gemini.google.com');
    this.isChatGPT = hostname.includes('openai.com') || hostname.includes('chatgpt.com');
    this.isClaude = hostname.includes('claude.ai');
    this.isWenxin = hostname.includes('yiyan.baidu.com');
    this.isTongyi = hostname.includes('qianwen.com');

    this.currentUrl = window.location.href; // 记录当前 URL
    this.isCollapsed = localStorage.getItem('msgNavCollapsed') === 'true'; // 读取收起状态

    this.init();
  }

  init() {
    // 创建导航条UI
    this.createNavigationBar();

    // 初始扫描现有消息
    this.scanExistingMessages();

    // 监听页面变化
    this.observeMessages();

    // 监听滚动事件
    this.setupScrollListener();

    // 监听 URL 变化
    this.observeUrlChange();
  }

  // 监听 URL 变化（检测对话切换）
  observeUrlChange() {
    setInterval(() => {
      const newUrl = window.location.href;
      if (newUrl !== this.currentUrl) {
        console.log('检测到 URL 切换，清空并重建导航列表');
        this.currentUrl = newUrl;
        this.clearAndReload();
      }
    }, 500);
  }

  // 清空并重新加载消息
  clearAndReload() {
    // 清空数据
    this.messages = [];
    this.messageTexts.clear();
    this.messageElements = new WeakSet();

    // 清空 UI
    this.navList.innerHTML = '';

    // 延迟重新扫描新对话的消息
    setTimeout(() => {
      this.scanExistingMessages();
    }, 1000);
  }

  createNavigationBar() {
    // 创建导航容器
    this.navContainer = document.createElement('div');
    this.navContainer.id = 'msg-nav-container';
    this.navContainer.className = 'msg-nav-container';

    // 如果之前是收起状态，添加 collapsed 类
    if (this.isCollapsed) {
      this.navContainer.classList.add('collapsed');
    }

    // 创建标题栏
    const header = document.createElement('div');
    header.className = 'msg-nav-header';

    // 创建标题
    const title = document.createElement('div');
    title.className = 'msg-nav-title';
    title.textContent = '消息导航';

    // 创建收起/展开按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'msg-nav-toggle';
    toggleBtn.innerHTML = '›'; // 右箭头
    toggleBtn.title = '收起/展开';

    // 点击切换状态
    toggleBtn.addEventListener('click', () => {
      this.toggleCollapse();
    });

    header.appendChild(title);
    header.appendChild(toggleBtn);

    // 创建消息列表
    this.navList = document.createElement('div');
    this.navList.className = 'msg-nav-list';

    this.navContainer.appendChild(header);
    this.navContainer.appendChild(this.navList);
    document.body.appendChild(this.navContainer);
  }

  // 切换收起/展开状态
  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;

    if (this.isCollapsed) {
      this.navContainer.classList.add('collapsed');
    } else {
      this.navContainer.classList.remove('collapsed');
    }

    // 保存状态到 localStorage
    localStorage.setItem('msgNavCollapsed', this.isCollapsed);
  }

  // 获取用户消息的选择器
  getUserMessageSelector() {
    if (this.isGemini) {
      // Gemini 的用户消息选择器（根据实际 DOM 结构调整）
      return 'message-content.user-query, .query-input-container, div[data-test-id*="user"], .user-message';
    } else if (this.isChatGPT) {
      // ChatGPT 的用户消息选择器
      return 'div[data-message-author-role="user"], .user-message';
    }
    return null;
  }

  // 扫描页面中已存在的消息
  scanExistingMessages() {
    const selector = this.getUserMessageSelector();
    if (!selector) return;

    let messageElements = [];

    // 通用方法：查找所有可能包含对话的容器
    const conversationContainers = document.querySelectorAll('main, [role="main"], .conversation, .chat-container');

    conversationContainers.forEach(container => {
      const inputs = container.querySelectorAll('textarea, input[type="text"]');
      inputs.forEach(input => {
        const messageEl = input.closest('div[class*="input"], div[class*="query"], div[class*="prompt"]');
        if (messageEl && !this.isMessageTracked(messageEl)) {
          messageElements.push(messageEl);
        }
      });
    });

    // 如果没找到，尝试查找所有包含文本的 div
    if (messageElements.length === 0) {
      this.findMessagesRecursively();
    } else {
      messageElements.forEach(el => this.addMessage(el));
    }
  }

  // 递归查找消息的替代方法
  findMessagesRecursively() {
    const userInputs = [];

    // 查找页面中所有交互区域
    const allDivs = document.querySelectorAll('div');

    allDivs.forEach(div => {
      const text = div.textContent?.trim();
      // 启发式：用户消息通常比较短，并且会有对应的 AI 回复
      if (text && text.length > 0 && text.length < 500) {
        // 检查是否是对话的一部分
        const parent = div.parentElement;
        if (parent && this.looksLikeUserMessage(div)) {
          userInputs.push(div);
        }
      }
    });

    // 去重并添加
    const seen = new Set();
    userInputs.forEach(el => {
      const text = el.textContent?.trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        this.addMessage(el);
      }
    });
  }

  // 判断元素是否看起来像用户消息
  looksLikeUserMessage(element) {
    const text = element.textContent?.trim() || '';
    const classes = element.className || '';
    const attrs = Array.from(element.attributes).map(a => a.name + '=' + a.value).join(' ');

    // 排除：输入框和可编辑元素
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return false;
    }
    if (element.contentEditable === 'true' || element.isContentEditable) {
      return false;
    }

    // 排除：包含输入框的容器
    if (element.querySelector('input, textarea, [contenteditable="true"]')) {
      return false;
    }

    // 排除：按钮、工具栏等界面元素
    const role = element.getAttribute('role');
    const excludeRoles = ['button', 'textbox', 'toolbar', 'menu', 'menuitem', 'tab'];
    if (role && excludeRoles.includes(role.toLowerCase())) {
      return false;
    }

    // 排除：按钮标签
    if (element.tagName === 'BUTTON') {
      return false;
    }

    // 排除：文本过短（可能是按钮或标签）
    if (text.length < 5) {
      return false;
    }

    // 排除：常见的界面提示词
    const excludeTexts = ['tools', 'thinking', 'send', 'submit', 'cancel', 'add', 'delete'];
    if (excludeTexts.some(word => text.toLowerCase().includes(word) && text.length < 20)) {
      return false;
    }

    // 排除：文件名模式（包含文件扩展名）
    const fileExtensions = ['.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.png', '.gif', '.zip', '.rar'];
    if (fileExtensions.some(ext => text.toLowerCase().includes(ext))) {
      return false;
    }

    // 排除：只包含文件名特征的文本（例如：xxx.xxx 格式）
    if (/^[\w-]+\.[a-zA-Z0-9]+$/.test(text.trim())) {
      return false;
    }

    // 千问特定：排除视频推荐标题
    if (this.isTongyi) {
      // 排除包含视频相关关键词的元素
      const videoKeywords = ['播放', '视频', 'video', '推荐'];
      if (videoKeywords.some(kw => text.includes(kw)) && text.length < 50) {
        return false;
      }
      // 检查是否在视频容器中
      const parent = element.closest('[class*="video"], [class*="recommend"]');
      if (parent) {
        return false;
      }
    }

    // 讯飞特定：排除历史记录名称
    if (this.isXinghuo) {
      // 检查是否在侧边栏或历史列表中
      const parent = element.closest('aside, [class*="sidebar"], [class*="history"], [class*="list"]');
      if (parent) {
        return false;
      }
    }

    // 关键词匹配
    const keywords = ['user', 'query', 'prompt', 'question'];
    const hasKeyword = keywords.some(kw =>
      classes.toLowerCase().includes(kw) ||
      attrs.toLowerCase().includes(kw)
    );

    return hasKeyword && text.length > 0;
  }

  // 验证是否是有效的用户消息（排除输入框等界面元素）
  isValidUserMessage(element) {
    // 检查是否是输入框或其父元素
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return false;
    }

    // 检查是否可编辑
    if (element.contentEditable === 'true' || element.isContentEditable) {
      return false;
    }

    // 检查是否包含输入框
    if (element.querySelector('input, textarea')) {
      return false;
    }

    // 检查角色属性
    const role = element.getAttribute('role');
    if (role && ['button', 'textbox', 'toolbar'].includes(role)) {
      return false;
    }

    return true;
  }

  // 检查消息是否已被跟踪
  isMessageTracked(element) {
    return this.messages.some(msg => msg.element === element);
  }

  // 添加消息到导航列表
  addMessage(element) {
    // 额外验证：确保不是输入框或界面元素
    if (!this.isValidUserMessage(element)) {
      return;
    }

    const text = this.extractMessageText(element);
    if (!text || text.length === 0) return;

    // 去重检查：如果相同文本已存在，则跳过
    if (this.messageTexts.has(text)) {
      return;
    }

    // 去重检查：如果元素已被跟踪，则跳过
    if (this.messageElements.has(element)) {
      return;
    }

    // 额外检查：验证元素位置是否与已有消息重复
    const rect = element.getBoundingClientRect();
    const isDuplicate = this.messages.some(msg => {
      const msgRect = msg.element.getBoundingClientRect();
      // 如果位置完全相同，认为是重复元素
      return Math.abs(rect.top - msgRect.top) < 5 &&
        Math.abs(rect.left - msgRect.left) < 5;
    });

    if (isDuplicate) {
      return;
    }

    const messageData = {
      element: element,
      text: text,
      index: this.messages.length + 1
    };

    this.messages.push(messageData);
    this.messageTexts.add(text);
    this.messageElements.add(element);
    this.renderMessageItem(messageData);

    // 文心一言特定：每次添加后重新排序（解决顺序相反问题）
    if (this.isWenxin) {
      this.reorderMessages();
    }
  }

  // 重新排序消息（按页面位置）
  reorderMessages() {
    // 按元素在页面中的位置排序
    this.messages.sort((a, b) => {
      const rectA = a.element.getBoundingClientRect();
      const rectB = b.element.getBoundingClientRect();
      return rectA.top - rectB.top;
    });

    // 重新设置索引
    this.messages.forEach((msg, index) => {
      msg.index = index + 1;
    });

    // 重新渲染导航列表
    this.navList.innerHTML = '';
    this.messages.forEach(msg => this.renderMessageItem(msg));
  }

  // 提取消息文本
  extractMessageText(element) {
    let text = element.textContent?.trim() || '';

    // 移除多余空白
    text = text.replace(/\s+/g, ' ');

    // 清理常见的消息前缀（ChatGPT 的 "You said"、"你说" 等）
    const prefixes = [
      /^You said[:\s]+/i,
      /^你说[：:\s]+/,
      /^User[:\s]+/i,
      /^用户[：:\s]+/
    ];

    for (const prefix of prefixes) {
      text = text.replace(prefix, '');
    }

    // 再次清理空白
    text = text.trim();

    // 截取前30个字符
    if (text.length > 30) {
      text = text.substring(0, 30) + '...';
    }

    return text;
  }

  // 渲染单个消息项
  renderMessageItem(messageData) {
    const item = document.createElement('div');
    item.className = 'msg-nav-item';
    item.dataset.messageIndex = messageData.index;

    const number = document.createElement('span');
    number.className = 'msg-nav-number';
    number.textContent = messageData.index;

    const textSpan = document.createElement('span');
    textSpan.className = 'msg-nav-text';
    textSpan.textContent = messageData.text;

    item.appendChild(number);
    item.appendChild(textSpan);

    // 点击跳转
    item.addEventListener('click', () => {
      this.scrollToMessage(messageData);
      this.highlightItem(item);
    });

    this.navList.appendChild(item);
  }

  // 滚动到指定消息
  scrollToMessage(messageData) {
    if (messageData.element) {
      // Kimi 特定：先触发小幅滚动激活页面，然后再跳转
      if (this.isKimi) {
        // 先滚动1px激活滚动容器
        window.scrollBy(0, 1);

        // 延迟后再执行实际跳转
        setTimeout(() => {
          messageData.element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });

          // 添加高亮效果
          this.addScrollHighlight(messageData.element);
        }, 100);
      } else {
        // 其他平台使用标准方法
        messageData.element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });

        // 添加高亮效果
        this.addScrollHighlight(messageData.element);
      }
    }
  }

  // 添加滚动高亮效果
  addScrollHighlight(element) {
    element.style.transition = 'background-color 0.3s';
    const originalBg = element.style.backgroundColor;
    element.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
    setTimeout(() => {
      element.style.backgroundColor = originalBg;
    }, 1000);
  }

  // 高亮当前项
  highlightItem(item) {
    // 移除之前的高亮
    if (this.currentHighlight) {
      this.currentHighlight.classList.remove('active');
    }

    // 添加新高亮
    item.classList.add('active');
    this.currentHighlight = item;
  }

  // 监听页面消息变化
  observeMessages() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(() => {
        // 延迟执行，等待 DOM 完全更新
        setTimeout(() => {
          this.checkForNewMessages();
        }, 500);
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 检查新消息
  checkForNewMessages() {
    // 重新扫描可能的消息元素
    const allElements = document.querySelectorAll('div, section, article');

    allElements.forEach(el => {
      if (this.looksLikeUserMessage(el) && !this.isMessageTracked(el)) {
        this.addMessage(el);
      }
    });
  }

  // 设置滚动监听
  setupScrollListener() {
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          this.updateActiveItemOnScroll();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // 根据滚动位置更新高亮
  updateActiveItemOnScroll() {
    const viewportMiddle = window.innerHeight / 2;

    let closestMessage = null;
    let closestDistance = Infinity;

    this.messages.forEach((msg) => {
      const rect = msg.element.getBoundingClientRect();
      const elementMiddle = rect.top + rect.height / 2;
      const distance = Math.abs(elementMiddle - viewportMiddle);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestMessage = msg;
      }
    });

    if (closestMessage) {
      const item = this.navList.querySelector(`[data-message-index="${closestMessage.index}"]`);
      if (item) {
        this.highlightItem(item);
      }
    }
  }
}

// 等待页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new MessageNavigator();
  });
} else {
  new MessageNavigator();
}
