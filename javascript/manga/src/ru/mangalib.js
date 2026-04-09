var mangayomiSources = [{"name":"Mangalib","id":737631136,"baseUrl":"https://mangalib.me","lang":"ru","typeSource":"single","iconUrl":"https://mangalib.org/static/images/logo/ml/icon-180.png","dateFormat":"","dateFormatLocale":"","isNsfw":true,"hasCloudflare":false,"sourceCodeUrl":"https://raw.githubusercontent.com/Chmosha/mangayomi-extensions/main/manga/src/ru/mangalib.js","apiUrl":"https://api.lib.social/api","version":"0.3.5","isManga":true,"itemType":0,"isFullData":false,"appMinVerReq":"0.5.0","additionalParams":"","sourceCodeLanguage":1,"notes":""}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        // ВАЖНО: Не используем this.source здесь, чтобы не было ошибки "not initialized"
        this.headers = {
            'accept': 'application/json, text/plain, */*',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Site-Id': '1',
            'Referer': 'https://mangalib.me/'
        };
    }

    parseStatus(status) {
        if (status === "Онгоинг") return 0;
        if (status === "Завершён") return 1;
        if (status === "Приостановлен") return 2;
        if (status === "Выпуск прекращён") return 3;
        if (status === "Анонс") return 4;
        return 5;
    }

    async parseMangaList(url) {
        var res = await this.client.get(url, this.headers);
        var json = JSON.parse(res.body);
        var mangas = json.data.map(function(m) {
            return {
                name: m.rus_name || m.name,
                imageUrl: m.cover ? (m.cover.default || m.cover.main) : "",
                link: m.slug_url || m.slug
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
        var url = "https://api.lib.social/api/manga?q=" + encodeURIComponent(query);
        
        if (!filters || filters.length === 0) {
            return await this.parseMangaList(url + "&page=" + page);
        }

        // Фильтры по списку (как в оригинале)
        if (filters[0] && filters[0].state) {
            for (var i = 0; i < filters[0].state.length; i++) {
                if (filters[0].state[i].state) url += "&types[]=" + filters[0].state[i].value;
            }
        }
        if (filters[1] && filters[1].state) {
            for (var i = 0; i < filters[1].state.length; i++) {
                if (filters[1].state[i].state) url += "&caution[]=" + filters[1].state[i].value;
            }
        }
        
        // Главы и Год
        if (filters[2] && filters[2].state) {
            var minCh = filters[2].state[0].values[filters[2].state[0].state].value;
            var maxCh = filters[2].state[1].values[filters[2].state[1].state].value;
            if (minCh) url += "&chap_count_min=" + minCh;
            if (maxCh) url += "&chap_count_max=" + maxCh;
        }

        // Жанры (TriState)
        if (filters[4] && filters[4].state) {
            for (var i = 0; i < filters[4].state.length; i++) {
                var f = filters[4].state[i];
                if (f.state === 1) url += "&genres[]=" + f.value;
                else if (f.state === 2) url += "&genres_exclude[]=" + f.value;
            }
        }

        // Сортировка
        if (filters[8]) {
            var sortVal = filters[8].values[filters[8].state.index].value;
            var sortType = filters[8].state.ascending ? 'asc' : 'desc';
            if (sortVal) url += "&sort_by=" + sortVal;
            url += "&sort_type=" + sortType;
        }

        return await this.parseMangaList(url + "&page=" + page);
    }

    async getDetail(link) {
        var infoRes = await this.client.get("https://api.lib.social/api/manga/" + link + "?fields[]=summary&fields[]=genres&fields[]=authors&fields[]=artists&fields[]=status", this.headers);
        var chapterRes = await this.client.get("https://api.lib.social/api/manga/" + link + "/chapters", this.headers);
        
        var info = JSON.parse(infoRes.body).data;
        var chapters = JSON.parse(chapterRes.body).data;
        var self = this;

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
                    url: "https://api.lib.social/api/manga/" + link + "/chapter?number=" + c.number + "&volume=" + c.volume,
                    dateUpload: (c.branches && c.branches[0]) ? new Date(c.branches[0].created_at).valueOf().toString() : null,
                    scanlator: (c.branches && c.branches[0] && c.branches[0].teams) ? c.branches[0].teams.map(function(t) { return t.name; }).join(', ') : ""
                };
            }).reverse()
        };
    }

    async getPageList(url) {
        var pref = new SharedPreferences();
        var serverId = pref.get('imageServer') || 'main';

        var constRes = await this.client.get("https://api.lib.social/api/constants?fields[]=imageServers", this.headers);
        var servers = JSON.parse(constRes.body).data.imageServers;
        var selectedUrl = servers[0].url;
        for (var i = 0; i < servers.length; i++) {
            if (servers[i].id === serverId) { selectedUrl = servers[i].url; break; }
        }

        var res = await this.client.get(url, this.headers);
        var chapter = JSON.parse(res.body).data;
        var h = this.headers;
        return chapter.pages.map(function(img) {
            return { url: selectedUrl + img.url, headers: h };
        });
    }

    getFilterList() {
        var chapterCounts = ['1','5','10','20','30','40','50','100','200','500','1000'].map(function(x){ return [x, x]; });
        var years = range(1980, 2025, -1).map(function(x){ return [x.toString(), x.toString()]; });
        return [
            { type_name: "GroupFilter", type: "type", name: "Тип", state: [["Манга", 1], ["OEL-манга", 4], ["Манхва", 5], ["Маньхуа", 6], ["Руманга", 8], ["Комикс", 9]].map(function(x){ return { type_name: 'CheckBox', name: x[0], value: "" + x[1] }; }) },
            { type_name: "GroupFilter", type: "age", name: "Рейтинг", state: [["Нет", 0], ["6+", 1], ["12+", 2], ["16+", 3], ["18+", 4]].map(function(x){ return { type_name: 'CheckBox', name: x[0], value: "" + x[1] }; }) },
            { type_name: "GroupFilter", type: "chapters", name: "Главы", state: [{ type_name: "SelectFilter", name: "от", state: 0, values: [['от', '']].concat(chapterCounts).map(function(x){ return { type_name: 'SelectOption', name: x[0], value: x[1] }; }) }, { type_name: "SelectFilter", name: "до", state: 0, values: [['до', '']].concat(chapterCounts).map(function(x){ return { type_name: 'SelectOption', name: x[0], value: x[1] }; }) }] },
            { type_name: "GroupFilter", type: "years", name: "Год", state: [{ type_name: "SelectFilter", name: "от", state: 0, values: [['от', '']].concat(years).map(function(x){ return { type_name: 'SelectOption', name: x[0], value: x[1] }; }) }, { type_name: "SelectFilter", name: "до", state: 0, values: [['до', '']].concat(years).map(function(x){ return { type_name: 'SelectOption', name: x[0], value: x[1] }; }) }] },
            { type_name: "GroupFilter", type: "genre", name: "Жанры", state: [["Арт", 32], ["Боевик", 34], ["Боевые искусства", 35], ["Гарем", 37], ["Драма", 43], ["Исекай", 79], ["Комедия", 47], ["Мистика", 50], ["Повседневность", 52], ["Приключения", 54], ["Психология", 55], ["Романтика", 56], ["Сверхъестественное", 58], ["Сёдзё", 59], ["Сэйнэн", 64], ["Триллер", 66], ["Ужасы", 67], ["Фэнтези", 69], ["Эротика", 71], ["Этти", 72]].map(function(x){ return { type_name: 'TriState', name: x[0], value: "" + x[1] }; }) },
            { type_name: "GroupFilter", type: "status", name: "Статус", state: [["Онгоинг", 1], ["Завершён", 2]].map(function(x){ return { type_name: 'CheckBox', name: x[0], value: "" + x[1] }; }) },
            { type_name: "GroupFilter", type: "trans", name: "Перевод", state: [["Продолжается", 1], ["Завершён", 2]].map(function(x){ return { type_name: 'CheckBox', name: x[0], value: "" + x[1] }; }) },
            { type_name: "GroupFilter", type: "format", name: "Формат", state: [["В цвете", 4], ["Вебтун", 7]].map(function(x){ return { type_name: 'TriState', name: x[0], value: "" + x[1] }; }) },
            { type_name: "SortFilter", type: "sort", name: "Сортировка", state: { type_name: "SortState", index: 0, ascending: false }, values: [['Популярность', ''], ['Рейтинг', 'rate_avg'], ['Просмотры', 'views'], ['Главы', 'chap_count'], ['Обновление', 'last_chapter_at']].map(function(x){ return { type_name: 'SelectOption', name: x[0], value: x[1] }; }) }
        ];
    }

    getSourcePreferences() {
        return [{ key: 'imageServer', listPreference: { title: 'Сервер', summary: '', valueIndex: 0, entries: ['Основной', 'Второй', 'Сжатие'], entryValues: ['main', 'secondary', 'compress'] } }];
    }
}

function range(s, e, st) {
    var a = [];
    for (var i = s; i <= e; i++) a.push(i);
    if (st < 0) a.reverse();
    return a;
}

// ЭТО САМАЯ ВАЖНАЯ СТРОКА ДЛЯ ANYMEX
const extention = new DefaultExtension();
