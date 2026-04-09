const mangayomiSources = [{"name":"Mangalib","id":737631136,"baseUrl":"https://mangalib.me","lang":"ru","typeSource":"single","iconUrl":"https://mangalib.org/static/images/logo/ml/icon-180.png","dateFormat":"","dateFormatLocale":"","isNsfw":true,"hasCloudflare":false,"sourceCodeUrl":"https://raw.githubusercontent.com/Chmosha/mangayomi-extensions/main/manga/src/ru/mangalib.js","apiUrl":"https://api.lib.social/api","version":"0.2.5","isManga":true,"itemType":0,"isFullData":false,"appMinVerReq":"0.5.0","additionalParams":"","sourceCodeLanguage":1,"notes":""}];

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
        if (status === "Онгоинг") return 0;
        if (status === "Завершён") return 1;
        if (status === "Приостановлен") return 2;
        if (status === "Выпуск прекращён") return 3;
        if (status === "Анонс") return 4;
        return 5;
    }

    async parseMangaList(url) {
        const res = await this.client.get(url, this.apiHeaders);
        const json = JSON.parse(res.body);
        const mangas = json.data.map(function(m) {
            return {
                name: m.rus_name || m.name,
                imageUrl: m.cover ? (m.cover.default || m.cover.main) : "",
                link: m.slug_url || m.slug
            };
        });
        return { 
            "list": mangas, 
            "hasNextPage": (json.links && json.links.next) ? true : false 
        };
    }

    async getPopular(page) {
        return await this.parseMangaList(this.source.apiUrl + "/manga?page=" + page + "&sort_by=views");
    }

    async getLatestUpdates(page) {
        return await this.parseMangaList(this.source.apiUrl + "/manga?page=" + page + "&sort_by=last_chapter_at");
    }

    async search(query, page, filters) {
        let url = this.source.apiUrl + "/manga?q=" + encodeURIComponent(query) + "&page=" + page;
        return await this.parseMangaList(url);
    }

    async getDetail(url) {
        const infoRes = await this.client.get(this.source.apiUrl + "/manga/" + url + "?fields[]=chap_count&fields[]=summary&fields[]=genres&fields[]=authors&fields[]=status", this.apiHeaders);
        const chapterRes = await this.client.get(this.source.apiUrl + "/manga/" + url + "/chapters", this.apiHeaders);
        
        const info = JSON.parse(infoRes.body).data;
        const chapters = JSON.parse(chapterRes.body).data;
        
        return {
            name: info.rus_name || info.name,
            imageUrl: info.cover ? info.cover.default : "",
            author: info.authors ? info.authors.map(function(x) { return x.name; }).join(', ') : "",
            status: this.parseStatus(info.status ? info.status.label : ""),
            description: info.summary || "",
            genre: info.genres ? info.genres.map(function(x) { return x.name; }) : [],
            chapters: chapters.map(function(c) {
                return {
                    name: "Том " + c.volume + " Глава " + c.number + (c.name ? ": " + c.name : ""),
                    url: "https://api.lib.social/api/manga/" + url + "/chapter?number=" + c.number + "&volume=" + c.volume,
                    dateUpload: (c.branches && c.branches[0]) ? new Date(c.branches[0].created_at).valueOf().toString() : null,
                    scanlator: (c.branches && c.branches[0] && c.branches[0].teams) ? c.branches[0].teams.map(function(t) { return t.name; }).join(', ') : ""
                };
            }).reverse()
        };
    }

    async getPageList(url) {
        const pref = new SharedPreferences();
        const serverId = pref.get('imageServer') || 'main';

        const constRes = await this.client.get(this.source.apiUrl + "/constants?fields[]=imageServers", this.apiHeaders);
        const servers = JSON.parse(constRes.body).data.imageServers;
        
        let selectedUrl = servers[0].url;
        for (let i = 0; i < servers.length; i++) {
            if (servers[i].id === serverId) {
                selectedUrl = servers[i].url;
                break;
            }
        }

        const res = await this.client.get(url, this.apiHeaders);
        const chapter = JSON.parse(res.body).data;
        
        const headers = this.apiHeaders;
        return chapter.pages.map(function(img) {
            return { url: selectedUrl + img.url, headers: headers };
        });
    }

    getFilterList() { return []; }

    getSourcePreferences() {
        return [{
            key: 'imageServer',
            listPreference: {
                title: 'Сервер изображений',
                summary: '',
                valueIndex: 0,
                entries: ['Основной', 'Второй', 'Сжатие'],
                entryValues: ['main', 'secondary', 'compress']
            }
        }];
    }
}
