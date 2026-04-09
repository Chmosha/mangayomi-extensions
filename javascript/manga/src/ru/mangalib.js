const mangayomiSources = [{
    "name": "Mangalib",
    "lang": "ru",
    "baseUrl": "https://mangalib.me",
    "apiUrl": "https://api.lib.social/api",
    "iconUrl": "https://mangalib.org/static/images/logo/ml/icon-180.png",
    "typeSource": "single",
    "isManga": true,
    "isNsfw": true,
    "version": "0.0.5",
    "pkgPath": "manga/src/ru/mangalib.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        // Настройка заголовков. Site-Id: 1 — это идентификатор Mangalib
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': 'https://mangalib.me/',
            'Accept': 'application/json, text/plain, */*',
            'Site-Id': '1' 
        };
    }

    async parseMangaList(url) {
        const res = await this.client.get(url, this.headers);
        const json = JSON.parse(res.body);
        const mangas = json.data.map(manga => ({
            name: manga.rus_name || manga.name,
            imageUrl: manga.cover?.default || manga.cover?.main,
            link: manga.slug_url || manga.slug
        }));

        return {
            list: mangas,
            hasNextPage: !!json.links?.next
        };
    }

    async getPopular(page) {
        return await this.parseMangaList(`${this.source.apiUrl}/manga?page=${page}&sort_by=views`);
    }

    async getLatestUpdates(page) {
        return await this.parseMangaList(`${this.source.apiUrl}/manga?page=${page}&sort_by=last_chapter_at`);
    }

    async search(query, page, filters) {
        let url = `${this.source.apiUrl}/manga?q=${encodeURIComponent(query)}&page=${page}`;
        // Логика фильтров (упрощенная для стабильности)
        if (filters && filters.length > 0) {
            for (const filter of filters) {
                if (filter.type === 'sort' && filter.state) {
                    const sortVal = filter.values[filter.state.index].value;
                    url += `&sort_by=${sortVal}&sort_type=${filter.state.ascending ? 'asc' : 'desc'}`;
                }
            }
        }
        return await this.parseMangaList(url);
    }

    async getDetail(url) {
        const infoRes = await this.client.get(`${this.source.apiUrl}/manga/${url}?fields[]=summary&fields[]=genres&fields[]=authors&fields[]=status`, this.headers);
        const info = JSON.parse(infoRes.body).data;

        const chapterRes = await this.client.get(`${this.source.apiUrl}/manga/${url}/chapters`, this.headers);
        const chaptersData = JSON.parse(chapterRes.body).data;

        return {
            name: info.rus_name || info.name,
            imageUrl: info.cover?.default,
            author: info.authors?.map(x => x.name).join(', '),
            status: { "Онгоинг": 0, "Завершён": 1, "Приостановлен": 2 }[info.status?.label] ?? 5,
            description: info.summary,
            genre: info.genres?.map(x => x.name),
            chapters: chaptersData.map(c => ({
                name: `Том ${c.volume} Глава ${c.number}${c.name ? ': ' + c.name : ''}`,
                url: `${this.source.apiUrl}/manga/${url}/chapter?number=${c.number}&volume=${c.volume}`,
                dateUpload: c.branches?.[0]?.created_at ? new Date(c.branches[0].created_at).valueOf().toString() : null,
                scanlator: c.branches?.[0]?.teams?.map(x => x.name).join(', ')
            })).reverse()
        };
    }

    async getPageList(url) {
        const res = await this.client.get(url, this.headers);
        const chapterData = JSON.parse(res.body).data;
        
        // Получаем сервер из настроек или используем основной
        const serverId = new SharedPreferences().get('imageServer') || 'main';
        const constRes = await this.client.get(`${this.source.apiUrl}/constants?fields[]=imageServers`, this.headers);
        const servers = JSON.parse(constRes.body).data.imageServers;
        const selectedServer = servers.find(s => s.id === serverId)?.url || servers[0].url;

        return chapterData.pages.map(img => ({
            url: selectedServer + img.url,
            headers: this.headers
        }));
    }

    getFilterList() {
        return [{
            type_name: "SortFilter",
            type: "sort",
            name: "Сортировка",
            state: { index: 0, ascending: false },
            values: [
                { name: 'По популярности', value: 'views' },
                { name: 'По рейтингу', value: 'rate_avg' },
                { name: 'Дата обновления', value: 'last_chapter_at' }
            ]
        }];
    }

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
