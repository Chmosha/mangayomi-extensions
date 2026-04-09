const mangayomiSources = [{
    "name": "Mangalib",
    "id": 737631136,
    "lang": "ru",
    "baseUrl": "https://mangalib.me",
    "apiUrl": "https://api.lib.social/api",
    "iconUrl": "https://mangalib.org/static/images/logo/ml/icon-180.png",
    "typeSource": "single",
    "itemType": 0,
    "isManga": true,
    "isNsfw": true,
    "version": "0.3.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "manga/src/ru/mangalib.js",
    "appMinVerReq": "0.5.0",
    "sourceCodeLanguage": 1
}];

class DefaultExtension extends MProvider {
    constructor () {
        super();
        this.client = new Client();
        this.apiHeaders = {
            'accept': 'application/json, text/plain, */*',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Site-Id': '1',
            'Referer': 'https://mangalib.me/'
        };
    }

    parseStatus(status) {
        var statuses = {
            "Онгоинг": 0,
            "Завершён": 1,
            "Приостановлен": 2,
            "Выпуск прекращён": 3,
            "Анонс": 4
        };
        return statuses[status] !== undefined ? statuses[status] : 5;
    }

    async parseMangaList(url) {
        const res = await this.client.get(url, this.apiHeaders);
        const json = JSON.parse(res.body);
        const mangas = json.data.map(function(manga) {
            return {
                name: manga.rus_name || manga.name,
                imageUrl: manga.cover ? manga.cover.default : "",
                link: manga.slug_url || manga.slug
            };
        });
        return { "list": mangas, "hasNextPage": (json.links && json.links.next) ? true : false };
    }

    async getPopular(page) {
        return await this.parseMangaList("https://api.lib.social/api/manga?page=" + page + "&sort_by=views");
    }

    async getLatestUpdates(page) {
        return await this.parseMangaList("https://api.lib.social/api/manga?page=" + page + "&sort_by=last_chapter_at");
    }

    async search(query, page, filters) {
        let url = "https://api.lib.social/api/manga?q=" + encodeURIComponent(query);
        
        if (!filters || filters.length == 0) {
            return await this.parseMangaList(url + "&page=" + page);
        }

        // 0: Тип
        for (const filter of filters[0].state) {
            if (filter.state == true) url += "&types[]=" + filter.value;
        }
        // 1: Возрастной рейтинг
        for (const filter of filters[1].state) {
            if (filter.state == true) url += "&caution[]=" + filter.value;
        }

        // 2: Количество глав
        const minChapF = filters[2].state[0];
        const maxChapF = filters[2].state[1];
        const minChap = minChapF.values[minChapF.state].value;
        const maxChap = maxChapF.values[maxChapF.state].value;
        if (minChap) url += "&chap_count_min=" + minChap;
        if (maxChap) url += "&chap_count_max=" + maxChap;

        // 3: Год
        const minYearF = filters[3].state[0];
        const maxYearF = filters[3].state[1];
        const minYear = minYearF.values[minYearF.state].value;
        const maxYear = maxYearF.values[maxYearF.state].value;
        if (minYear) url += "&year_min=" + minYear;
        if (maxYear) url += "&year_max=" + maxYear;

        // 4: Жанры
        for (const filter of filters[4].state) {
            if (filter.state == 1) url += "&genres[]=" + filter.value;
            else if (filter.state == 2) url += "&genres_exclude[]=" + filter.value;
        }
        // 5: Статус титула
        for (const filter of filters[5].state) {
            if (filter.state == true) url += "&status[]=" + filter.value;
        }
        // 6: Статус перевода
        for (const filter of filters[6].state) {
            if (filter.state == true) url += "&scanlate_status[]=" + filter.value;
        }
        // 7: Формат
        for (const filter of filters[7].state) {
            if (filter.state == 1) url += "&format[]=" + filter.value;
            else if (filter.state == 2) url += "&format_exclude[]=" + filter.value;
        }

        // 8: Сортировка
        const sortVal = filters[8].values[filters[8].state.index].value;
        const sortType = filters[8].state.ascending ? 'asc' : 'desc';
        if (sortVal) url += "&sort_by=" + sortVal;
        url += "&sort_type=" + sortType;

        return await this.parseMangaList(url + "&page=" + page);
    }

    async getDetail(url) {
        const infoRes = await this.client.get("https://api.lib.social/api/manga/" + url + "?fields[]=chap_count&fields[]=summary&fields[]=genres&fields[]=authors&fields[]=artists&fields[]=status", this.apiHeaders);
        const chapterRes = await this.client.get("https://api.lib.social/api/manga/" + url + "/chapters", this.apiHeaders);
        
        const info = JSON.parse(infoRes.body).data;
        const chapters = JSON.parse(chapterRes.body).data;
        const chapterBaseUrl = "https://api.lib.social/api/manga/" + url + "/chapter";
        
        const self = this;
        return {
            name: info.rus_name || info.name,
            imageUrl: info.cover ? info.cover.default : "",
            author: info.authors ? info.authors.map(function(x) { return x.name; }).join(', ') : "",
            artist: info.artists ? info.artists.map(function(x) { return x.name; }).join(', ') : "",
            status: self.parseStatus(info.status ? info.status.label : ""),
            description: info.summary || "",
            genre: info.genres ? info.genres.map(function(x) { return x.name; }) : [],
            chapters: chapters.map(function(c) {
                return {
                    name: "Том " + c.volume + " Глава " + c.number + (c.name ? ": " + c.name : ""),
                    url: chapterBaseUrl + "?number=" + c.number + "&volume=" + c.volume,
                    dateUpload: (c.branches && c.branches[0]) ? new Date(c.branches[0].created_at).valueOf().toString() : null,
                    scanlator: (c.branches && c.branches[0] && c.branches[0].teams) ? c.branches[0].teams.map(function(t) { return t.name; }).join(', ') : ""
                };
            }).reverse()
        };
    }

    async getPageList(url) {
        const pref = new SharedPreferences();
        const serverId = pref.get('imageServer') || 'main';

        let res = await this.client.get("https://api.lib.social/api/constants?fields[]=imageServers", this.apiHeaders);
        const imageServers = JSON.parse(res.body).data.imageServers;
        
        let imageServer = imageServers[0].url;
        for (let i = 0; i < imageServers.length; i++) {
            if (imageServers[i].id === serverId) {
                imageServer = imageServers[i].url;
                break;
            }
        }

        res = await this.client.get(url, this.apiHeaders);
        const chapter = JSON.parse(res.body).data;
        const headers = this.apiHeaders;
        return chapter.pages.map(function(img) {
            return { url: imageServer + img.url, headers: headers };
        });
    }

    getFilterList() {
        const chapterCounts = ['1','5','10','20','30','40','50','100','200','500','1000','2000','5000','10000'].map(x => [x, x]);
        const years = [...range(1980, new Date().getFullYear() + 1, -1), ...range(1930, 1971, -10)].map(x => {
            x = x.toString();
            return [x, x];
        });
        return [
            {
                type_name: "GroupFilter",
                type: "type",
                name: "Тип",
                state: [
                    ["Манга", 1], ["OEL-манга", 4], ["Манхва", 5], ["Маньхуа", 6], ["Руманга", 8], ["Комикс", 9]
                ].map(x => ({ type_name: 'CheckBox', name: x[0], value: "" + x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "age_restriction",
                name: "возрастной рейтинг",
                state: [
                    ["Нет", 0], ["6+", 1], ["12+", 2], ["16+", 3], ["18+", 4]
                ].map(x => ({ type_name: 'CheckBox', name: x[0], value: "" + x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "chapter_count",
                name: "Количество глав",
                state: [
                    {
                        type_name: "SelectFilter",
                        type: "chap_count_min",
                        name: "от",
                        state: 0,
                        values: [['от', ''], ...chapterCounts].map(x => ({ type_name: 'SelectOption', name: x[0], value: x[1] }))
                    },
                    {
                        type_name: "SelectFilter",
                        type: "chap_count_max",
                        name: "до",
                        state: 0,
                        values: [['до', ''], ...chapterCounts].map(x => ({ type_name: 'SelectOption', name: x[0], value: x[1] }))
                    }
                ]
            },
            {
                type_name: "GroupFilter",
                type: "years",
                name: "Год выпуска",
                state: [
                    {
                        type_name: "SelectFilter",
                        type: "year_min",
                        name: "от",
                        state: 0,
                        values: [['от', ''], ...years].map(x => ({ type_name: 'SelectOption', name: x[0], value: x[1] }))
                    },
                    {
                        type_name: "SelectFilter",
                        type: "year_max",
                        name: "до",
                        state: 0,
                        values: [['до', ''], ...years].map(x => ({ type_name: 'SelectOption', name: x[0], value: x[1] }))
                    }
                ]
            },
            {
                type_name: "GroupFilter",
                type: "genre",
                name: "Жанры",
                state: [
                    ["Арт", 32], ["Безумие", 91], ["Боевик", 34], ["Боевые искусства", 35], ["Вампиры", 36], ["Военное", 89], ["Гарем", 37], ["Гендерная интрига", 38], ["Героическое фэнтези", 39], ["Демоны", 81], ["Детектив", 40], ["Детское", 88], ["Драма", 43], ["Игра", 44], ["Исекай", 79], ["История", 45], ["Киберпанк", 46], ["Кодомо", 76], ["Комедия", 47], ["Космос", 83], ["Магия", 85], ["Махо-сёдзё", 48], ["Машины", 90], ["Меха", 49], ["Мистика", 50], ["Музыка", 80], ["Научная фантастика", 51], ["Омегаверс", 77], ["Пародия", 86], ["Повседневность", 52], ["Полиция", 82], ["Постапокалиптика", 53], ["Приключения", 54], ["Психология", 55], ["Романтика", 56], ["Самурайский боевик", 57], ["Сверхъестественное", 58], ["Сёдзё", 59], ["Сёдзё-ай", 60], ["Сёнэн-ай", 62], ["Спорт", 63], ["Супер сила", 87], ["Сэйнэн", 64], ["Трагедия", 65], ["Триллер", 66], ["Ужасы", 67], ["Фантастика", 68], ["Фэнтези", 69], ["Хентай", 84], ["Эротика", 71], ["Этти", 72]                    
                ].map(x => ({ type_name: 'TriState', name: x[0], value: "" + x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "status",
                name: "Статус титула",
                state: [
                    ["Онгоинг", 1], ["Завершён", 2], ["Анонс", 3], ["Приостановлен", 4], ["Выпуск прекращён", 5]
                ].map(x => ({ type_name: 'CheckBox', name: x[0], value: "" + x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "translation_status",
                name: "Статус перевода",
                state: [
                    ["Продолжается", 1], ["Завершён", 2], ["Заморожен", 3], ["Заброшен", 4]
                ].map(x => ({ type_name: 'CheckBox', name: x[0], value: "" + x[1] }))
            },
            {
                type_name: "GroupFilter",
                type: "format",
                name: "Формат выпуска",
                state: [
                    ["4-кома (Ёнкома)", 1], ["Сборник", 2], ["Додзинси", 3], ["В цвете", 4], ["Сингл", 5], ["Веб", 6], ["Вебтун", 7]
                ].map(x => ({ type_name: 'TriState', name: x[0], value: "" + x[1] }))
            },
            {
                type_name: "SortFilter",
                type: "sort",
                name: "Сортировать",
                state: { type_name: "SortState", index: 0, ascending: false },
                values: [
                    ['По популярности', ''], ['По рейтингу', 'rate_avg'], ['По просмотрам', 'views'], ['Количество глав', 'chap_count'], ['дата релиза', 'releaseDate'], ['дата обновления', 'last_chapter_at'], ['дата добавления', 'created_at'], ['По названию (A-Z)', 'name'], ['По названию (A-Я)', 'rus_name']
                ].map(x => ({ type_name: 'SelectOption', name: x[0], value: x[1] }))
            }
        ];
    }
    getSourcePreferences() {
        return [{
            key: 'imageServer',
            listPreference: {
                title: 'Image Server',
                summary: '',
                valueIndex: 0,
                entries: ['Первый', 'Второй', 'Сжатия', 'Скачивание', 'Crop pages'],
                entryValues: ['main', 'secondary', 'compress', 'download', 'crop']
            }
        }];
    }
}

function range (first, last, step) {
    if (last <= first) return [];
    if (!step) step = 1;
    if (!last) { last = first; first = 0; }
    const start = step > 0 ? first : last - 1;
    let length = Math.ceil((last - first) / Math.abs(step));
    return Array.from(new Array(length), (x, i) => start + i * step);
}

// Инициализация расширения для Anymex
const extention = new DefaultExtension();
