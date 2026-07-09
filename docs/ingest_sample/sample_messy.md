1. 什么是闭包?请举例说明其应用场景。
答案:闭包是指有权访问另一函数作用域中变量的函数。常用于回调、模块化、私有变量。
解析:闭包的本质是词法作用域链,函数在其定义时的作用域中查找变量。

2. 以下哪个不是 JavaScript 的基本数据类型?
A. string
B. number
C. object
D. boolean
答案:C
解析:object 是引用类型,基本类型包括 string/number/boolean/null/undefined/symbol/bigint。

3. 简述浏览器的事件循环(Event Loop)机制。
答案:JavaScript 是单线程的,通过事件循环处理异步任务。调用栈执行同步代码,异步任务完成后回调进入任务队列,分为宏任务(setTimeout、I/O 等)和微任务(Promise.then 等)。每次宏任务执行完后,会清空所有微任务,再执行下一个宏任务。
解析:理解事件循环对掌握异步执行顺序至关重要。

4. 什么是虚拟 DOM?它解决了什么问题?
答案:虚拟 DOM 是用 JavaScript 对象描述真实 DOM 树的轻量副本。当状态变化时,先生成新的虚拟 DOM,与旧虚拟 DOM diff 出最小变更,再批量更新真实 DOM,减少直接操作 DOM 的性能开销。
解析:React、Vue 都采用虚拟 DOM 作为性能优化与跨平台渲染的基础。

5. 请说明 HTTP 与 HTTPS 的区别。
答案:HTTPS 在 HTTP 基础上加入 SSL/TLS 加密层,数据传输加密;默认端口 HTTP 为 80,HTTPS 为 443;HTTPS 需要证书,可验证服务器身份。
解析:HTTPS 解决了 HTTP 明文传输、无法验证身份、易被窃听篡改的问题。

6. 写一个函数,判断一个字符串是否是回文。
答案:function isPalindrome(s){ const t=s.replace(/[^a-zA-Z0-9]/g,'').toLowerCase(); return t===t.split('').reverse().join(''); }
解析:先去除非字母数字并转小写,再比较反转后是否相等。

7. 什么是 RESTful API?有哪些常见的设计原则?
答案:REST 是一种基于 HTTP 的架构风格。原则包括:用 URL 表示资源,用 HTTP 方法(GET/POST/PUT/DELETE)表示操作,无状态,用状态码表达结果,资源表述用 JSON/XML。
解析:REST 强调资源导向、统一接口、无状态,是 Web API 设计的主流风格。
