// Local UI translations. Keeping these in the application (rather than
// sending page contents to a third party) makes language changes immediate,
// works offline, and keeps visitor content on the site.
export const LOCALES = ["en", "uk", "th", "zh", "de", "fr", "pt", "ko", "es"];

// "Luna Terminal" is deliberately absent: translate() falls back to the key,
// and a product name reads as itself in every locale. The entry it replaced
// listed the former product name eight times to say the same thing.
const COPY = {
  "Search for stocks, tickers, companies": ["Пошук акцій, тикерів, компаній", "ค้นหาหุ้น ตัวย่อ และบริษัท", "搜索股票、代码和公司", "Aktien, Ticker und Unternehmen suchen", "Rechercher des actions, des symboles et des entreprises", "Pesquisar ações, códigos e empresas", "주식, 티커, 기업 검색", "Buscar acciones, símbolos y empresas"],
  Dashboard: ["Панель", "แดชบอร์ด", "仪表板", "Übersicht", "Tableau de bord", "Painel", "대시보드", "Panel"],
  "Research tools": ["Інструменти дослідження", "เครื่องมือวิจัย", "研究工具", "Recherchetools", "Outils de recherche", "Ferramentas de pesquisa", "리서치 도구", "Herramientas de investigación"],
  Interactive: ["Інтерактивне", "อินเทอร์แอคทีฟ", "互动工具", "Interaktiv", "Interactif", "Interativo", "인터랙티브", "Interactivo"],
  "Portfolio comparison": ["Порівняння портфелів", "เปรียบเทียบพอร์ตโฟลิโอ", "投资组合比较", "Portfoliovergleich", "Comparaison de portefeuilles", "Comparação de portfólios", "포트폴리오 비교", "Comparación de carteras"],
  "Hedgefund 13F's": ["13F хедж-фондів", "13F ของเฮดจ์ฟันด์", "对冲基金 13F", "Hedgefonds-13Fs", "13F des fonds spéculatifs", "13Fs de fundos de hedge", "헤지펀드 13F", "13F de fondos de cobertura"],
  "Create watchlist": ["Створити список відстеження", "สร้างรายการเฝ้าดู", "创建自选列表", "Watchlist erstellen", "Créer une liste de suivi", "Criar lista de acompanhamento", "관심 종목 만들기", "Crear lista de seguimiento"],
  "Fear and greed meter": ["Індикатор страху та жадібності", "มาตรวัดความกลัวและความโลภ", "恐惧与贪婪指数", "Angst-und-Gier-Meter", "Indicateur peur et avidité", "Medidor de medo e ganância", "공포와 탐욕 지수", "Medidor de miedo y codicia"],
  "Index vs Stock": ["Індекс проти акції", "ดัชนีเทียบกับหุ้น", "指数与股票", "Index gegen Aktie", "Indice vs action", "Índice vs ação", "지수 대 주식", "Índice frente a acción"],
  "Upcoming events": ["Майбутні події", "กิจกรรมที่จะเกิดขึ้น", "即将发生的事件", "Kommende Ereignisse", "Événements à venir", "Próximos eventos", "예정된 이벤트", "Próximos eventos"],
  "Popular stocks": ["Популярні акції", "หุ้นยอดนิยม", "热门股票", "Beliebte Aktien", "Actions populaires", "Ações populares", "인기 주식", "Acciones populares"],
  "Stock Maps": ["Карти акцій", "แผนที่หุ้น", "股票地图", "Aktienkarten", "Cartes boursières", "Mapas de ações", "주식 지도", "Mapas de acciones"],
  "Supply chain": ["Ланцюг постачання", "ห่วงโซ่อุปทาน", "供应链", "Lieferkette", "Chaîne d’approvisionnement", "Cadeia de suprimentos", "공급망", "Cadena de suministro"],
  "Chart metrics": ["Показники графіків", "ตัวชี้วัดกราฟ", "图表指标", "Diagrammkennzahlen", "Indicateurs graphiques", "Métricas de gráfico", "차트 지표", "Métricas de gráficos"],
  "Stock screener": ["Скрінер акцій", "คัดกรองหุ้น", "股票筛选器", "Aktienscreener", "Filtre d’actions", "Filtro de ações", "주식 스크리너", "Buscador de acciones"],
  "Company World Map": ["Карта компаній світу", "แผนที่บริษัทโลก", "全球公司地图", "Weltkarte der Unternehmen", "Carte mondiale des entreprises", "Mapa mundial de empresas", "세계 기업 지도", "Mapa mundial de empresas"],
  "RSI Backtester": ["Тестер RSI", "ทดสอบ RSI", "RSI 回测", "RSI-Backtester", "Testeur RSI", "Testador RSI", "RSI 백테스터", "Probador RSI"],
  Menu: ["Меню", "เมนู", "菜单", "Menü", "Menu", "Menu", "메뉴", "Menú"],
  Language: ["Мова", "ภาษา", "语言", "Sprache", "Langue", "Idioma", "언어", "Idioma"],
  "Compare against": ["Порівняти з", "เปรียบเทียบกับ", "与之比较", "Vergleichen mit", "Comparer avec", "Comparar com", "비교 대상", "Comparar con"],
  Load: ["Завантажити", "โหลด", "加载", "Laden", "Charger", "Carregar", "불러오기", "Cargar"],
  "Ticker symbol": ["Символ тикера", "สัญลักษณ์หุ้น", "股票代码", "Ticker-Symbol", "Symbole boursier", "Símbolo da ação", "티커 기호", "Símbolo bursátil"],
  "Current readings": ["Поточні показники", "ค่าปัจจุบัน", "当前读数", "Aktuelle Werte", "Lectures actuelles", "Leituras atuais", "현재 수치", "Lecturas actuales"],
  "Fear & Greed": ["Страх і жадібність", "ความกลัวและความโลภ", "恐惧与贪婪", "Angst & Gier", "Peur et avidité", "Medo e ganância", "공포와 탐욕", "Miedo y codicia"],
  "Extreme Fear": ["Надзвичайний страх", "ความกลัวอย่างมาก", "极度恐惧", "Extreme Angst", "Peur extrême", "Medo extremo", "극도의 공포", "Miedo extremo"],
  Neutral: ["Нейтрально", "เป็นกลาง", "中性", "Neutral", "Neutro", "Neutro", "중립", "Neutral"],
  "Extreme Greed": ["Надзвичайна жадібність", "ความโลภอย่างมาก", "极度贪婪", "Extreme Gier", "Avidité extrême", "Ganância extrema", "극도의 탐욕", "Codicia extrema"],
  "Correlation (visible range)": ["Кореляція (видимий діапазон)", "สหสัมพันธ์ (ช่วงที่แสดง)", "相关性（可见范围）", "Korrelation (sichtbarer Bereich)", "Corrélation (plage visible)", "Correlação (intervalo visível)", "상관관계(표시 범위)", "Correlación (rango visible)"],
  "Chart options": ["Налаштування графіка", "ตัวเลือกกราฟ", "图表选项", "Diagrammoptionen", "Options du graphique", "Opções do gráfico", "차트 옵션", "Opciones del gráfico"],
  "Upcoming Events": ["Майбутні події", "กิจกรรมที่จะเกิดขึ้น", "即将发生的事件", "Kommende Ereignisse", "Événements à venir", "Próximos eventos", "예정된 이벤트", "Próximos eventos"],
  today: ["сьогодні", "วันนี้", "今天", "heute", "aujourd’hui", "hoje", "오늘", "hoy"],
  "Avg. move:": ["Сер. рух:", "การเคลื่อนไหวเฉลี่ย:", "平均变动：", "Durchschn. Bewegung:", "Mouvement moy. :", "Movimento médio:", "평균 변동:", "Movimiento prom.:"],
  Compare: ["Порівняти", "เปรียบเทียบ", "比较", "Vergleichen", "Comparer", "Comparar", "비교", "Comparar"],
  "Add a stock to compare": ["Додайте акцію для порівняння", "เพิ่มหุ้นเพื่อเปรียบเทียบ", "添加要比较的股票", "Aktie zum Vergleichen hinzufügen", "Ajouter une action à comparer", "Adicionar uma ação para comparar", "비교할 주식 추가", "Añadir una acción para comparar"],
  Searching: ["Пошук", "กำลังค้นหา", "搜索中", "Suche läuft", "Recherche en cours", "Pesquisando", "검색 중", "Buscando"],
  "No matches": ["Немає збігів", "ไม่พบรายการ", "没有匹配项", "Keine Treffer", "Aucun résultat", "Sem resultados", "일치 항목 없음", "Sin coincidencias"],
};

export function translate(locale, value) {
  if (locale === "en" || !value) return value;
  const translations = COPY[value];
  return translations?.[LOCALES.indexOf(locale) - 1] ?? value;
}
