import { gql, IResolvers, AuthenticationError, ApolloError } from 'apollo-server-koa';
import Series from '../entity/Series';
import { ApolloContext } from '../app';
import { getRepository } from 'typeorm';
import SeriesPosts from '../entity/SeriesPosts';
import Post from '../entity/Post';

export const typeDef = gql`
  type Series {
    id: ID!
    user: User
    name: String
    description: String
    url_slug: String
    created_at: Date
    updated_at: Date
    series_posts: [SeriesPost]
    thumbnail: String
    posts_count: Int
  }
  type SeriesPost {
    id: ID!
    index: Int
    post: Post
  }
  extend type Query {
    series(id: ID, username: String, url_slug: String): Series
    seriesList(username: String): [Series]
  }
  extend type Mutation {
    createSeries(name: String!, url_slug: String!): Series
    appendToSeries(series_id: ID!, post_id: ID!): Int
  }
`;

type CreateSeriesArgs = {
  name: string;
  url_slug: string;
};

type AppendToSeriesArgs = {
  post_id: string;
  series_id: string;
};

export const resolvers: IResolvers<any, ApolloContext> = {
  Series: {
    series_posts: async (parent: Series, _: any, { loaders }) => {
      return loaders.seriesPosts.load(parent.id);
    },
    user: async (parent: Series, _: any, { loaders }) => {
      return loaders.user.load(parent.fk_user_id);
    },
    thumbnail: async (parent: Series) => {
      const seriesPostRepo = getRepository(SeriesPosts);
      const seriesPost = await seriesPostRepo
        .createQueryBuilder('series_post')
        .leftJoinAndSelect('series_post.post', 'post')
        .where('series_post.index = 1')
        .andWhere('series_post.fk_series_id = :seriesId', { seriesId: parent.id })
        .getOne();
      if (!seriesPost) return null;
      return seriesPost.post.thumbnail;
    },
    posts_count: async (parent: Series) => {
      const repo = getRepository(SeriesPosts);
      const count = await repo.count({
        where: {
          fk_series_id: parent.id
        }
      });
      return count;
    }
  },
  Query: {
    series: async (parent: any, { id, username, url_slug }: any, ctx) => {
      const seriesRepo = getRepository(Series);
      if (id) {
        const series = await seriesRepo.findOne(id);
        return series;
      }

      const series = await seriesRepo
        .createQueryBuilder('series')
        .leftJoinAndSelect('series.user', 'user')
        .where('user.username = :username', { username })
        .andWhere('series.url_slug = :url_slug', { url_slug })
        .getOne();

      return series;
    },
    seriesList: async (parent: any, { username }: any, ctx: any) => {
      const seriesRepo = getRepository(Series);
      const seriesList = await seriesRepo
        .createQueryBuilder('series')
        .leftJoinAndSelect('series.user', 'user')
        .where('user.username = :username', { username })
        .orderBy('name')
        .getMany();
      return seriesList;
    }
  },
  Mutation: {
    createSeries: async (parent: any, args, ctx) => {
      if (!ctx.user_id) {
        throw new AuthenticationError('Not Logged In');
      }
      const { name, url_slug } = args as CreateSeriesArgs;
      const seriesRepo = getRepository(Series);
      const exists = await seriesRepo.findOne({
        where: {
          name
        }
      });
      if (exists) {
        throw new ApolloError('URL Slug already exists', 'ALREADY_EXISTS');
      }
      const series = new Series();
      series.fk_user_id = ctx.user_id;
      series.name = name;
      series.url_slug = url_slug;
      await seriesRepo.save(series);
      return series;
    },
    appendToSeries: async (parent, args, ctx) => {
      if (!ctx.user_id) {
        throw new AuthenticationError('Not Logged In');
      }
      const { series_id, post_id } = args as AppendToSeriesArgs;

      const seriesRepo = getRepository(Series);
      const series = await seriesRepo.findOne(series_id);
      if (!series) {
        throw new ApolloError('Series not found', 'NOT_FOUND');
      }
      if (series.fk_user_id !== ctx.user_id) {
        throw new ApolloError('This series is not yours', 'NO_PERMISSION');
      }

      const seriesPostsRepo = getRepository(SeriesPosts);
      const seriesPostsList = await seriesPostsRepo.find({
        where: {
          fk_series_id: series_id
        },
        order: {
          index: 'ASC'
        }
      });
      const exists = seriesPostsList.find(sp => sp.fk_post_id === post_id);

      if (exists) {
        throw new ApolloError('Already added to series', 'CONFLICT');
      }

      const nextIndex =
        seriesPostsList.length === 0 ? 1 : seriesPostsList[seriesPostsList.length - 1].index + 1;

      // create new seriesPost
      const seriesPosts = new SeriesPosts();
      seriesPosts.fk_post_id = post_id;
      seriesPosts.fk_series_id = series_id;
      seriesPosts.index = nextIndex;

      // save
      await seriesPostsRepo.save(seriesPosts);
      return nextIndex;
    }
  }
};
