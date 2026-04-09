const mangayomiSources = [{"name":"Mangalib","lang":"ru","baseUrl":"https://mangalib.me","apiUrl":"https://api.lib.social/api","iconUrl":"https://mangalib.org/static/images/logo/ml/icon-180.png","typeSource":"single","itemType":0,"version":"0.1.6","pkgPath":"manga/src/ru/mangalib.js","isNsfw":true,"hasCloudflare":false}];

class DefaultExtension extends MProvider {
    constructor () {
        super();
        this.client = new Client();
        this.apiHeaders = {
            'Referer': 'https://mangalib.me/',
            'Accept': 'application/json, text/plain, */*',
            'Site-Id': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        };
    }

    async parseMangaList(url) {
        const res = await this.client.get(url, this.apiHeaders);
        const json = JSON.parse(res.body);
        const list = json.data.map(manga => ({
            name: manga.rus_name || manga.name,
            imageUrl: manga.cover?.default || manga.cover?.main,
            link: manga.slug_url || manga.slug
        }));
        return { "list": list, "hasNextPage": !!json.links?.next };
    }

    async getPopular(page) {
        return await this.parseMangaList(`${this.source.apiUrl}/manga?page=${page}&sort_by=views`);
    }

    async getLatestUpdates(page) {
        return await this.parseMangaList(`${this.source.apiUrl}/manga?page=${page}&sort_by=last_chapter_at`);
    }

    async search(query, page, filters) {
        let url = `${this.source.apiUrl}/manga?q=${encodeURIComponent(query)}&page=${page}`;
        return await this.parseMangaList(url);
    }

    async getDetail(url) {
        const infoRes = await this.client.get(`${this.source.apiUrl}/manga/${url}?fields[]=summary&fields[]=genres&fields[]=authors&fields[]=status`, this.apiHeaders);
        const chapterRes = await this.client.get(`${this.source.apiUrl}/manga/${url}/chapters`, this.apiHeaders);
        
        const info = JSON.parse(infoRes.body).data;
        const chapters = JSON.parse(chapterRes.body).data;
        
        const statusMap = { "Онгоинг": 0, "Завершён": 1, "Приостановлен": 2, "Выпуск прекращён": 3, "Анонс": 4 };

        return {
            name: info.rus_name || info.name,
            imageUrl: info.cover?.default,
            author: info.authors?.map(x => x.name).join(', '),
            status: statusMap[info.status?.label] ?? 5,
            description: info.summary,
            genre: info.genres?.map(x => x.name),
            chapters: chapters.map(c => ({
                name: `Том ${c.volume} Глава ${c.number}${c.name ? ': ' + c.name : ''}`,
                url: `${this.source.apiUrl}/manga/${url}/chapter?number=${c.number}&volume=${c.volume}`,
                dateUpload: c.branches?.[0]?.created_at ? new Date(c.branches[0].created_at).valueOf().toString() : null,
                scanlator: c.branches?.[0]?.teams?.map(x => x.name).join(', ')
            })).reverse()
        };
    }

    async getPageList(url) {
        const res = await this.client.get(url, this.apiHeaders);
        const chapter = JSON.parse(res.body).data;
        const constRes = await this.client.get(`${this.source.apiUrl}/constants?fields[]=imageServers`, this.apiHeaders);
        const servers = JSON.parse(constRes.body).data.imageServers;
        const prefServer = new SharedPreferences().get('imageServer') || 'main';
        const selectedServer = servers.find(s => s.id === prefServer)?.url || servers[0].url;

        return chapter.pages.map(img => ({
            url: selectedServer + img.url,
            headers: this.apiHeaders
        }));
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
