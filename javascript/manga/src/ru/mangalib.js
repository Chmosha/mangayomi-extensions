const mangayomiSources = [{
    "name": "Mangalib",
    "lang": "ru",
    "baseUrl": "https://mangalib.me",
    "apiUrl": "https://api.lib.social/api",
    "iconUrl": "https://mangalib.org/static/images/logo/ml/icon-180.png",
    "typeSource": "single",
    "isManga": true,
    "isNsfw": true,
    "version": "0.0.2",
    "pkgPath": "manga/src/ru/mangalib.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        // Основные заголовки для обхода базовых проверок
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://mangalib.me/',
            'Accept': 'application/json, text/plain, */*',
            'Site-Id': '1' // ID для mangalib.me
        };
    }

    parseStatus(status) {
        const statuses = {
            "Онгоинг": 0,
            "Завершён": 1,
            "Приостановлен": 2,
            "Выпуск прекращён": 3,
            "Анонс": 4
        };
        return statuses[status] ?? 5;
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
            hasNextPage: !!json.meta?.has_next_page || json.links?.next !== null
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

        if (filters && filters.length > 0) {
            for (const filter of filters) {
                if (filter.type === 'type' && filter.state) {
                    filter.state.forEach(f => { if (f.state) url += `&types[]=${f.value}`; });
                }
                if (filter.type === 'status' && filter.state) {
                    filter.state.forEach(f => { if (f.state) url += `&status[]=${f.value}`; });
                }
                if (filter.type === 'genre' && filter.state) {
                    filter.state.forEach(f => {
                        if (f.state === 1) url += `&genres[]=${f.value}`;
                        else if (f.state === 2) url += `&genres_exclude[]=${f.value}`;
                    });
                }
                if (filter.type === 'sort' && filter.state) {
                    const sortVal = filter.values[filter.state.index].value;
                    const sortType = filter.state.ascending ? 'asc' : 'desc';
                    url += `&sort_by=${sortVal}&sort_type=${sortType}`;
                }
            }
        }

        return await this.parseMangaList(url);
    }

    async getDetail(url) {
        // Получаем инфо о манге
        const infoRes = await this.client.get(`${this.source.apiUrl}/manga/${url}?fields[]=summary&fields[]=genres&fields[]=authors&fields[]=artists&fields[]=status`, this.headers);
        const info = JSON.parse(infoRes.body).data;

        // Получаем список глав
        const chapterRes = await this.client.get(`${this.source.apiUrl}/manga/${url}/chapters`, this.headers);
        const chaptersData = JSON.parse(chapterRes.body).data;

        return {
            name: info.rus_name || info.name,
            imageUrl: info.cover?.default,
            author: info.authors?.map(x => x.name).join(', '),
            artist: info.artists?.map(x => x.name).join(', '),
            status: this.parseStatus(info.status?.label),
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
        // Сначала получаем доступные серверы, если нужно, или используем дефолтный
        const serverPref = new SharedPreferences().get('imageServer') || 'main';
        
        const res = await this.client.get(url, this.headers);
        const chapter = JSON.parse(res.body).data;
        
        // Получаем базовый URL сервера
        const constRes = await this.client.get(`${this.source.apiUrl}/constants?fields[]=imageServers`, this.headers);
        const servers = JSON.parse(constRes.body).data.imageServers;
        
        let selectedServer = servers.find(s => s.id === serverPref)?.url || servers[0].url;

        return chapter.pages.map(img => ({
            url: selectedServer + img.url,
            headers: this.headers
        }));
    }

    getFilterList() {
        return [
            {
                type_name: "SortFilter",
                type: "sort",
                name: "Сортировка",
                state: { index: 0, ascending: false },
                values: [
                    { name: 'По популярности', value: 'views' },
                    { name: 'По рейтингу', value: 'rate_avg' },
                    { name: 'Дата обновления', value: 'last_chapter_at' },
                    { name: 'Дата релиза', value: 'releaseDate' },
                    { name: 'Кол-во глав', value: 'chap_count' }
                ]
            },
            {
                type_name: "GroupFilter",
                type: "type",
                name: "Тип",
                state: [
                    { type_name: 'CheckBox', name: "Манга", value: "1" },
                    { type_name: 'CheckBox', name: "Манхва", value: "5" },
                    { type_name: 'CheckBox', name: "Маньхуа", value: "6" },
                    { type_name: 'CheckBox', name: "Комикс", value: "9" }
                ]
            },
            {
                type_name: "GroupFilter",
                type: "status",
                name: "Статус",
                state: [
                    { type_name: 'CheckBox', name: "Онгоинг", value: "1" },
                    { type_name: 'CheckBox', name: "Завершён", value: "2" },
                    { type_name: 'CheckBox', name: "Приостановлен", value: "4" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [{
            key: 'imageServer',
            listPreference: {
                title: 'Сервер изображений',
                summary: 'Выберите сервер для загрузки картинок',
                valueIndex: 0,
                entries: ['Основной (Main)', 'Второй (Secondary)', 'Сжатие (Compress)'],
                entryValues: ['main', 'secondary', 'compress']
            }
        }];
    }
}
