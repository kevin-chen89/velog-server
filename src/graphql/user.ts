import { ApolloContext } from './../app';
import { gql, IResolvers, AuthenticationError, ApolloError } from 'apollo-server-koa';
import User from '../entity/User';
import { getRepository, getManager } from 'typeorm';
import VelogConfig from '../entity/VelogConfig';
import Series from '../entity/Series';
import UserProfile from '../entity/UserProfile';

export const typeDef = gql`
  type User {
    id: ID!
    username: String
    email: String
    created_at: Date
    updated_at: Date
    is_certified: Boolean
    profile: UserProfile
    velog_config: VelogConfig
    series_list: [Series]
  }
  type UserProfile {
    id: ID!
    display_name: String
    short_bio: String
    thumbnail: String
    created_at: Date
    updated_at: Date
    about: String
    profile_links: JSON
  }
  type VelogConfig {
    id: ID!
    title: String
    logo_image: String
  }
  extend type Query {
    user(id: ID, username: String): User
    velog_config(username: String): VelogConfig
    auth: User
  }
  extend type Mutation {
    update_about(about: String!): UserProfile
  }
`;

export const resolvers: IResolvers<any, ApolloContext> = {
  User: {
    profile: async (parent: User, _: any, { loaders }: ApolloContext) => {
      return loaders.userProfile.load(parent.id);
    },
    velog_config: async (parent: User, _: any, context: ApolloContext) => {
      const { loaders }: ApolloContext = context;
      return loaders.velogConfig.load(parent.id);
    },
    email: (parent: User, _: any, context: any) => {
      if (context.user_id !== parent.id) {
        throw new AuthenticationError('No permission to read email address');
      }
      return parent.email;
    },
    series_list: async (parent: User, _: any, { loaders }) => {
      const seriesRepo = getRepository(Series);
      const seriesList = await seriesRepo.find({
        where: {
          fk_user_id: parent.id
        },
        order: {
          updated_at: 'DESC'
        }
      });
      return seriesList;
    }
  },
  Query: {
    user: async (parent: any, { id, username }: any) => {
      const repo = getRepository(User);
      try {
        if (username) {
          const user = await repo.findOne({
            where: {
              username
            }
          });
          return user;
        }
        const user = await repo.findOne({
          id
        });
        return user;
      } catch (e) {
        console.log(e);
      }
    },
    velog_config: async (parent: any, { username }: any) => {
      const repo = getRepository(VelogConfig);
      const velogConfig = repo
        .createQueryBuilder('velog_config')
        .leftJoinAndSelect('velog_config.user', 'user')
        .where('user.username = :username', { username })
        .getOne();
      return velogConfig;
    },
    auth: async (parent: any, params: any, ctx) => {
      if (!ctx.user_id) return null;
      return ctx.loaders.user.load(ctx.user_id);
    }
  },
  Mutation: {
    update_about: async (parent: any, args: any, ctx) => {
      if (!ctx.user_id) {
        throw new AuthenticationError('Not Logged In');
      }
      const userProfileRepo = getRepository(UserProfile);
      const profile = await userProfileRepo.findOne({
        where: {
          fk_user_id: ctx.user_id
        }
      });
      const { about } = args as { about: string };
      if (!profile) {
        throw new ApolloError('Failed to retrieve user profile');
      }
      profile.about = about || '';
      await userProfileRepo.save(profile);
      return profile;
    }
  }
};
